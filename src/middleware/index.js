const searchRecord = require('./search-record');
const search = require('./search');
const searchAutocomplete = require('./search-autocomplete');
module.exports = function () {
  // Add your custom middleware here. Remember, that
  // in Express the order matters
  const app = this; // eslint-disable-line no-unused-vars

  const esConfig = app.get('esConfig');

  app.get('/api/search/record', searchRecord(esConfig));
  app.get('/api/search/autocomplete', searchAutocomplete(esConfig));
  app.get('/api/search', search(esConfig));
};
