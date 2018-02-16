/*
 * Sails.js/Waterline adapter for Google Cloud Datastore.
 */
const GoogleCloudDatastore = require('@google-cloud/datastore');
const _ = require('@sailshq/lodash');
const registeredDsEntries = {};
const _models = {};

function createManager(config) {

  const {
    projectId
  } = config;

  return new GoogleCloudDatastore({
    projectId: projectId,
  });

}

module.exports = {
  adapterApiVersion: 1,
  identity: 'sails-google-cloud-datastore',
  defaults: {
    schema: false
  },
  datastores: registeredDsEntries,
  googleCloudDatastore: GoogleCloudDatastore,
  // Lifecycle adapter methods
  registerDatastore: (dsConfig, models, done) => {

    const {
      identity,
      projectId
    } = dsConfig;

    if (!identity) {
      let msg = 'Consistency violation: A datastore should ' +
        'contain an "identity" property: a special identifier that uniquely ' +
        'identifies it across this app.  This should have been provided by ' +
        'Waterline core!  If you are seeing this message, there could be a ' +
        'bug in Waterline, or the datastore could have become corrupted by ' +
        'userland code, or other code in this adapter.  If you determine ' +
        'that this is a Waterline bug, please report this at ' +
        'http://sailsjs.com/bugs.';
      return done(new Error(msg));
    }

    if (registeredDsEntries[identity]) {
      let msg = 'Consistency violation: Cannot register datastore: `' +
        identity + '`, because it is already registered with this adapter! ' +
        'This could be due to an unexpected race condition in userland code ' +
        '(e.g. attempting to initialize Waterline more than once), or it ' +
        'could be due to a bug in this adapter.  (If you get stumped, reach ' +
        'out at http://sailsjs.com/support.)';
      return done(new Error(msg));
    }

    if (!projectId) {
      let msg = 'Missing required configuration `projectId`';
      return done(new Error(msg));
    }

    // Create a manager
    registeredDsEntries[identity] = {
      config: dsConfig,
      manager: createManager({projectId})
    };

    _.each(models, model => {

      _models[model.identity] = {
        primaryKey: model.primaryKey,
        attributes: model.definition,
        tableName: model.tableName,
        identity: model.identity,
      };

    });

    done();

  },
  teardown: (identity, done) => {

    delete registeredDsEntries[identity];

    done();

  },
  createManager: createManager,
  // DML
  /**
   * Create a new record
   *{
  "method": "create",
  "using": "invites",
  "newRecord": {
    "email": "testing@test.com",
    "isAdmin": false,
    "createdAt": "2018-02-12T21:45:02.549Z",
    "updatedAt": "2018-02-12T21:45:02.549Z",
    "redeemed": "",
    "_id": null
  },
  "meta": {
    "fetch": true
  }
}
   * @param {string} identity
   * @param {StageThreeQuery} s3q
   * @param {Function} done
   '0': 'development',
 '1':
  { method: 'create',
    using: 'googletokens',
    newRecord:
     { keyId: '1',
       email: 'test',
       access_token: 'abs',
       refresh_token: 'bsd',
       expiry_date: 1,
       createdAt: '2018-02-15T16:57:59.981Z',
       updatedAt: '2018-02-15T16:57:59.981Z',

       _id: null },
    meta: { fetch: true } },'
    { '0': 'development',
  '1':
   { method: 'create',
     using: 'invites',
     newRecord:
      { email: 'test@test.com',
        isAdmin: false,
        createdAt: '2018-02-15T19:41:39.586Z',
        updatedAt: '2018-02-15T19:41:39.586Z',
        redeemed: '',
        _id: null },
     meta: { fetch: true } },

  '2': [Function: _afterTalkingToAdapter] }'
   */
  create: (identity, s3q, done) => {

    const GoogleCloudDatastoreInstance = registeredDsEntries[identity].manager;
    const tableName = s3q.using;
    const values = s3q.newRecord;
    const model = _.find(_models, {tableName});
    const pk = model.primaryKey;
    const definition = model.attributes;
    const errors = [];
    const item = {};

    for (let key in definition) {

      let attrDef = definition[key];
      let value = values[attrDef.columnName];

      if (!value && attrDef.defaultsTo) { value = attrDef.defaultsTo; };

      // if automigrations generate ID

      if ((typeof value === 'undefined' || value === null) && attrDef.required) {

        errors.push(`Missing value for required key ${key} type ${attrDef.type || attrDef}`);

      } else {

        item[key] = value;

      }

    }

    if (errors.length) { return done(errors); }

    const dsKey = GoogleCloudDatastoreInstance.key([tableName, values[pk]]);

    if (errors.length) { return done(errors); }

    GoogleCloudDatastoreInstance
      .save({
        key: dsKey,
        data: item
      })
      .then(() => {

        done(null, item);

      })
      .catch(done);

  },
  /**
   * @param {string} identity
   * @param {StageThreeQuery} s3q
   * @param {Object} values
   * @param {Function} done
   { '0': 'development',
  '1':
   { method: 'update',
     using: 'googletokens',
     criteria: { where: {}, limit: 9007199254740991, skip: 0, sort: [] },
     valuesToSet: { updatedAt: '2018-02-15T16:56:37.158Z' },
     meta: { fetch: true } },
  '2': [Function: _afterTalkingToAdapter] }
  { '0': 'development',
  '1':
   { method: 'update',
     using: 'invites',
     criteria:
      { where: { email: 'test@test.com' },
        limit: 9007199254740991,
        skip: 0,
        sort: [] },
     valuesToSet: { isAdmin: true, updatedAt: '2018-02-15T19:42:08.713Z' },
     meta: { fetch: true } },
  '2': [Function: _afterTalkingToAdapter] }
   */
  update: (identity, s3q, values, done) => {

    const GoogleCloudDatastoreInstance = registeredDsEntries[identity].manager;
    const model = _models[s3q.using];
    const definition = model.definition;
    const item = {};

    for (let key in definition) {

      if (values[key]) { item[key] = values[key]; }

    }

    GoogleCloudDatastoreInstance
      .update({
        key: s3q.using,
        data: item
      })
      .then(done)
      .catch(done);


  },
  /*
  { '0': 'development',
  '1':
   { method: 'destroy',
     using: 'invites',
     criteria:
      { where: { email: 'test@test.com' },
        limit: 9007199254740991,
        skip: 0,
        sort: [] },
     meta: undefined },
  '2': [Function: _afterTalkingToAdapter] }
*/
  destroy: (identity, s3q, done) => {

    const GoogleCloudDatastoreInstance = registeredDsEntries[identity].manager;
    const item = {};

    GoogleCloudDatastoreInstance
      .update({
        key: s3q.using,
        data: item
      })
      .then(done)
      .catch(done);

  },
  // DQL
/*
  {
    "method": "find",
    "using": "users",
    "criteria": {
      "where": {
        "email": "dwilkerson@lunametrics.com"
      },
      "limit": 2,
      "skip": 0,
      "sort": []
    },
    "joins": []
  }*/
  /* find all
  { '0': 'development',
  '1':
   { method: 'find',
     using: 'invites',
     criteria: { where: {}, limit: 9007199254740991, skip: 0, sort: [] },
     meta: undefined,
     joins: [] },
  '2': [Function] }
  */
  find: (identity, s3q, done) => {

    const GoogleCloudDatastoreInstance = registeredDsEntries[identity].manager;
    const {
      name,
      criteria
    } = s3q;
    const query = GoogleCloudDatastoreInstance.createQuery(name);

    for (let key in criteria) {

      query.filter(key, criteria[key]);

    }

    if (criteria.limit) {
      query.limit(criteria.limit);
    }

    if (criteria.skip) {
      return done(new Error('Skip not implemented'));
    }

    return GoogleCloudDatastoreInstance
      .runQuery(query)
      .then(done)
      .catch(done);

  },
  /*
  { '0': 'development',
  '1':
   { method: 'count',
     using: 'invites',
     criteria: { where: {} },
     meta: undefined,
     numericAttrName: 'undefined' },
  '2': [Function: _afterTalkingToAdapter] }

  count: (identity, s3q, done) => {

    done();

  },
  sum: (identity, s3q, done) => {

    done();

  },
  avg: (identity, s3q, done) => {
    done();
  },
  */
  // DDL
  // Create collection
  define: (identity, tableName, modelDef, done) => {
    done();
  },
  // Destroy collection
  drop: (datastoreName, tableName, unused, done) => {
    done();
  }
};
