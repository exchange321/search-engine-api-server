const elasticsearch = require('elasticsearch');
const errors = require('feathers-errors');
const natural = require('natural');
const url = require('url');

const wordnet = new natural.WordNet();
const tokenizer = new natural.WordTokenizer();

const print = message => console.log(JSON.stringify(message, null, 4));

const getExpansions = word => new Promise((resolve) => {
  wordnet.lookup(word, results => {
    resolve(results.map((result) => {
      print({
        lemma: result.lemma,
        def: result.def,
      });
      return result.synonyms.map(synonym => synonym.toLowerCase().split('_').join(' ').trim());
    }).reduce((a, b) => a.concat(b), []));
  });
});

const expandQuery = async (tokens, level, totalLevel) => {
  if (totalLevel === undefined) {
    totalLevel = level;
  }
  if (level-- <= 1) {
    return tokens;
  }
  const dictionary = tokens.map(token => token.text);
  let newTokens = [];
  for (let token of dictionary) {
    let results = await getExpansions(token);
    results = results.filter(result => !dictionary.includes(result)).map(result => ({
      text: result,
      weight: +(level / totalLevel / 500).toFixed(4),
    }));
    newTokens = [...newTokens, ...results];
  }
  newTokens = await expandQuery(newTokens, level, totalLevel);
  newTokens = newTokens.filter(token => !dictionary.includes(token.text));
  return [...tokens, ...newTokens]
};

module.exports = function (options = {}) {
  return async function searchDocument(req, res, next) {
    const startTime = new Date();

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
      client.search(query).then(({  hits }) => {
        const endTime = new Date();
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({
          took: endTime - startTime,
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
            multi_match: {
              query: q,
              type: 'best_fields',
              fields: ['title', 'body'],
              cutoff_frequency: 0.001,
              minimum_should_match: '3<75%',
            },
          },
          should: [
            {
              multi_match: {
                query: q,
                type: 'phrase',
                fields: ['title', 'body'],
              },
            },
            {
              match: {
                keywords: q,
              },
            },
            {
              multi_match: {
                query: 'service',
                fields: ['title', 'body'],
              },
            },
          ],
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

        // query = {
        //   index,
        //   type,
        //   body: {
        //     size: 0,
        //     _source: false,
        //     query: queryBody,
        //   },
        // };
        //
        // const { hits: { total } } = await client.search(query);
        // const median = Math.round(total / 2);
        // const fromMedian = Math.floor(median / 10);
        // let indexMedian = (median & 10) - 1;
        // if (indexMedian < 0) {
        //   indexMedian = 9;
        // }
        //
        // query = {
        //   index,
        //   type,
        //   body: {
        //     from: fromMedian,
        //     size: 10,
        //     _source: false,
        //     query: queryBody,
        //   },
        // };
        //
        // const { hits: { hits: qsHits } } = await client.search(query);
        // const qsMedian = qsHits[indexMedian]._score;
        //
        // query = {
        //   index,
        //   type,
        //   body: {
        //     from: fromMedian,
        //     size: 10,
        //     _source: false,
        //     query: {
        //       function_score: {
        //         query: queryBody,
        //         functions,
        //         score_mode: "sum",
        //         boost_mode: "replace",
        //       },
        //     },
        //   },
        // };
        //
        // const { hits: { hits: tsHits } } = await client.search(query);
        // const tsMedian = tsHits[indexMedian]._score;

        query = {
            index,
            type,
            body: {
              size: 1,
              _source: false,
              query: queryBody,
            },
        };

        const { hits: { hits: qsHits } } = await client.search(query);
        const qsMax = qsHits[0]._score;

        query = {
          index,
          type,
          body: {
            size: 1,
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
        const tsMax = tsHits[0]._score;

        // const multiplier = qsMedian / tsMedian;
        const multiplier = qsMax / tsMax;

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

      client.search(query).then(({ hits }) => {
        const endTime = new Date();
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({
          took: endTime - startTime,
          hits,
        }));
      }).catch((err) => {
        next(new errors.GeneralError(err.message, err))
      });
    }
  };
};
