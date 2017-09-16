const elasticsearch = require('elasticsearch');
const errors = require('feathers-errors');
const url = require('url');

module.exports = function (options = {}) {
  return function searchAutocompletion(req, res, next) {
    const { host, port, apiVersion, index, type } = options;

    const client = new elasticsearch.Client({
      host: `${host}:${port}`,
      apiVersion
    });

    let { q } = url.parse(req.url, true).query;

    if (q === undefined) {
      next(new errors.BadRequest('Query is empty'));
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
              size: 5,
            },
          },
        },
      },
    }).then(({ took, aggregations: { suggestions: { buckets } } }) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        took,
        buckets,
      }));
    }).catch((err) => {
      next(new errors.GeneralError(err.message, err))
    });
  };
};
