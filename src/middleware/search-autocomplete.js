const elasticsearch = require('elasticsearch');
const errors = require('feathers-errors');
const url = require('url');

module.exports = function (options = {}) {
  return function searchAutocomplete(req, res, next) {
    const { host, port, apiVersion, index, type } = options;

    const client = new elasticsearch.Client({
      host: `${host}:${port}`,
      apiVersion
    });

    let { q, s } = url.parse(req.url, true).query;

    if (q === undefined) {
      next(new errors.BadRequest('Query is empty'));
    }

    let size = 5;

    if (s !== undefined) {
      s = parseInt(s);
      if (s > 0 && s <= 10) {
        size = s;
      }
    }

    client.search({
      index,
      type,
      body: {
        size: 0,
        query: {
          term: {
            'autocompletion.completion': q,
          },
        },
        aggs: {
          suggestions: {
            terms: {
              field: 'autocompletion.raw',
              size,
            },
          },
        },
      },
    }).then(({ took, hits }) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        took,
        hits,
      }));
    }).catch((err) => {
      next(new errors.GeneralError(err.message, err))
    });
  };
};
