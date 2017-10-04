const elasticsearch = require('elasticsearch');
const errors = require('feathers-errors');
const url = require('url');

module.exports = function (options = {}) {
  return function searchSuggest(req, res, next) {
    const { host, port, apiVersion, index, type } = options;

    const client = new elasticsearch.Client({
      host: `${host}:${port}`,
      apiVersion
    });

    let { q } = url.parse(req.url, true).query;

    if (q === undefined) {
      next(new errors.BadRequest('Query is empty'));
    }

    const query = {
      index,
      type,
      body: {
        suggest: {
          text: q,
          body_suggest: {
            phrase: {
              analyzer: 'standard',
              field: 'body',
              size: 5,
              gram_size: 3,
              direct_generator: [
                {
                  field: 'body',
                  suggest_mode: 'popular',
                },
              ],
            },
          },
        },
      },
    };

    client.search(query).then(({ took, suggest: { body_suggest } }) => {
      const { options } = body_suggest[0];
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        took,
        suggestions: options,
      }));
    }).catch((err) => {
      next(new errors.GeneralError(err.message, err))
    });
  };
};
