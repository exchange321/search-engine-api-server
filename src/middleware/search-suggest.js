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
        _source: '',
        suggest: {
          text: q,
          keyword_suggest: {
            prefix: q,
            completion: {
              field: 'completions',
              size: 5,
            },
          },
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

    client.search(query).then(({ took, suggest: { keyword_suggest, body_suggest } }) => {
      let { options: keyword_options } = keyword_suggest[0];
      keyword_options = keyword_options.map(({ text }) => text.trim().split(/\W+/).map(word => word.trim()).join(' '));
      let { options: body_options } = body_suggest[0];
      body_options = body_options.map(({ text }) => text.trim().split(/\W+/).map(word => word.trim()).join(' '));
      let options = keyword_options.concat(body_options);
      options = options.filter((option, key) => options.indexOf(option) === key);
      options = options.map(option => ({
        text: option,
      })).slice(0, 5);
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
