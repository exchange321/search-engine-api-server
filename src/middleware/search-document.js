const elasticsearch = require('elasticsearch');
const errors = require('feathers-errors');
const url = require('url');

const print = message => console.log(JSON.stringify(message, null, 4));

module.exports = function (options = {}) {
  return async function searchDocument(req, res, next) {
    const { host, port, apiVersion, index, type } = options;
    const numTopics = parseInt(options.numTopics);

    const client = new elasticsearch.Client({
      host: `${host}:${port}`,
      apiVersion
    });

    let { q, p, id, i, w, b } = url.parse(req.url, true).query;

    i = i !== 'false';
    if (id !== undefined) {
      const query = {
        index,
        type,
        body: {
          from: 0,
          size: 1,
          _source: ['title', 'description', 'url', 'image'],
          query: {
            bool: {
              must: {
                term: {
                  _id: id,
                },
              },
            },
          },
        },
      };

      if (i) {
        query.body.query.bool.filter = {
          term: {
            'info.iframe': true,
          },
        }
      }
      client.search(query).then(({ took, hits }) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({
          took,
          hits,
        }));
      }).catch((err) => {
        next(new errors.GeneralError(err.message, err))
      });
    } else {
      if (q === undefined) {
        next(new errors.BadRequest('Query is empty'));
      }

      let from = 0;
      let size = 1;

      if (p !== undefined) {
        p = parseInt(p);
        if (p > 0) {
          size = 10;
          from = (p - 1) * size;
        }
      }

      if (w !== undefined) {
        w = w.split(',');
      } else {
        w = [];
      }

      if (b !== undefined) {
        b = b.split(',');
      } else {
        b = [];
      }

      const e = [...w, ...b];

      let query = {};

      const queryBody = {
        bool: {
          must: {
            query_string: {
              query: q,
              fields: ['title', 'body'],
              analyzer: 'english',
              auto_generate_phrase_queries: true,
            },
          },
          should: {
            query_string: {
              query: q,
              fields: ['title', 'body'],
              analyzer: 'english',
              default_operator: 'AND',
            },
          },
          must_not: {
            terms: {
              _id: e,
            },
          },
        },
      };

      if (i) {
        queryBody.bool.filter = {
          term: {
            'info.iframe': true,
          },
        }
      }

      if (w.length > 0 || b.length > 0) {
        const weights = {};
        for (let i = 0; i < numTopics; i++) {
          weights[i.toString()] = 1;
        }
        if (w.length > 0) {
          const query = {
            index,
            type,
            body: {
              size: w.length,
              _source: ['categories'],
              query: {
                terms: {
                  _id: w,
                },
              },
            },
          };
          const { hits: { hits } } = await client.search(query);
          hits.forEach(({ _source: { categories } }) => {
            Object.keys(categories).forEach(topic => weights[topic] += categories[topic]);
          });
        }
        if (b.length > 0) {
          const query = {
            index,
            type,
            body: {
              size: w.length,
              _source: ['categories'],
              query: {
                terms: {
                  _id: b,
                },
              },
            },
          };
          const { hits: { hits } } = await client.search(query);
          hits.forEach(({ _source: { categories } }) => {
            Object.keys(categories).forEach(topic => weights[topic] -= categories[topic]);
          });
        }
        const smallest = Math.min(...Object.values(weights));
        if (smallest < 0) {
          Object.keys(weights).forEach(topic => weights[topic] += Math.abs(smallest));
        }

        const sum = Object.values(weights).reduce((sum, value) => sum + value, 0);

        Object.keys(weights).forEach(topic => weights[topic] /= sum);

        let functions = Object.keys(weights).map(topic => ({
          field_value_factor: {
            field: `categories.${topic}`,
            factor: weights[topic],
            missing: 0,
          }
        }));

        query = {
          index,
          type,
          body: {
            size: 0,
            _source: false,
            query: queryBody,
          },
        };

        const { hits: { total } } = await client.search(query);
        const median = Math.round(total / 2);
        const fromMedian = Math.floor(median / 10);
        let indexMedian = (median & 10) - 1;
        if (indexMedian < 0) {
          indexMedian = 9;
        }

        query = {
          index,
          type,
          body: {
            from: fromMedian,
            size: 10,
            _source: false,
            query: queryBody,
          },
        };

        const { hits: { hits: qsHits } } = await client.search(query);
        const qsMedian = qsHits[indexMedian]._score;

        query = {
          index,
          type,
          body: {
            from: fromMedian,
            size: 10,
            _source: false,
            query: {
              function_score: {
                query: queryBody,
                functions,
                score_mode: "sum",
                boost_mode: "replace",
              },
            },
          },
        };

        const { hits: { hits: tsHits } } = await client.search(query);
        const tsMedian = tsHits[indexMedian]._score;

        const multiplier = qsMedian / tsMedian;

        functions.forEach(func => func.field_value_factor.factor *= multiplier);

        query = {
          index,
          type,
          body: {
            from,
            size,
            _source: ['title', 'description', 'url', 'image'],
            query: {
              function_score: {
                query: queryBody,
                functions,
                score_mode: "sum",
                boost_mode: "sum",
              },
            },
          },
        };
      } else {
        query = {
          index,
          type,
          body: {
            from,
            size,
            _source: ['title', 'description', 'url', 'image'],
            query: queryBody,
          },
        };
      }

      client.search(query).then(({ took, hits }) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({
          took,
          hits,
        }));
      }).catch((err) => {
        next(new errors.GeneralError(err.message, err))
      });
    }
  };
};
