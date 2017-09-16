const elasticsearch = require('elasticsearch');
const errors = require('feathers-errors');
const url = require('url');

module.exports = function (options = {}) {
  return function searchDocument(req, res, next) {
    const { host, port, apiVersion, index, type } = options;

    const client = new elasticsearch.Client({
      host: `${host}:${port}`,
      apiVersion
    });

    let { q, p, e, id, i } = url.parse(req.url, true).query;

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

      if (e !== undefined) {
        e = e.split(',');
      } else {
        e = [];
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

      const query = {
        index,
        type,
        body: {
          from,
          size,
          _source: ['title', 'description', 'url', 'image'],
          query: {
            bool: {
              must: {
                multi_match: {
                  query: q,
                  fields: ['title', 'body'],
                },
              },
              must_not: {
                terms: {
                  _id: e,
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
    }
  };
};
