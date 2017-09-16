const elasticsearch = require('elasticsearch');
const errors = require('feathers-errors');

module.exports = function (options = {}) {
  return function search(req, res, next) {
    const { host, port, apiVersion, index, type } = options;

    const client = new elasticsearch.Client({
      host: `${host}:${port}`,
      apiVersion
    });

    client.ping({
      // ping usually has a 3000ms timeout
      requestTimeout: 1000
    }, function (error) {
      if (error) {
        next(new errors.Unavailable('elasticsearch cluster is down!'));
      } else {
        res.send('All is well');
      }
    });
  };
};
