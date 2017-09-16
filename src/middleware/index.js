const searchDocument = require('./search-document');
const search = require('./search');
const searchAutocompletion = require('./search-autocompletion');
module.exports = function () {
  // Add your custom middleware here. Remember, that
  // in Express the order matters
  const app = this; // eslint-disable-line no-unused-vars

  const esConfig = app.get('esConfig');

  app.get('/api/search/document', searchDocument(esConfig));
  app.get('/api/search/autocompletion', searchAutocompletion(esConfig));
  app.get('/api/search', search(esConfig));
};
