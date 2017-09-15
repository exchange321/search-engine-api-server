const search = require('./search');
module.exports = function () {
  // Add your custom middleware here. Remember, that
  // in Express the order matters
  const app = this; // eslint-disable-line no-unused-vars

  app.get('/api/search', search(app.get('esConfig')));
};
