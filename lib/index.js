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
      manager: createManager({projectId}),
      sequences: {}
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
   *
   * @param {string} identity
   * @param {StageThreeQuery} s3q
   * @param {Function} done
   */
  create: (identity, s3q, done) => {

    const gcDatastoreInstance = registeredDsEntries[identity].manager;
    const tableName = s3q.using;
    const values = s3q.newRecord;
    const model = _.find(_models, {tableName});
    const primaryKey = model.primaryKey;
    const definition = model.attributes;
    const item = prepareInputData({definition, primaryKey, values});
    const pkValue = item[primaryKey];
    const key = gcDatastoreInstance.key([tableName, pkValue])

    delete item[primaryKey];

    gcDatastoreInstance
      .save({
        key: key,
        data: item
      })
      .then(() => {

        item[primaryKey] = key.path[1];

        if (!s3q.meta.fetch) return done();

        done(null, item);

      })
      .catch(done);

  },
  createEach: (identity, s3q, done) => {

    const gcDatastoreInstance = registeredDsEntries[identity].manager;
    const tableName = s3q.using;
    const allValues = s3q.newRecords;
    const model = _.find(_models, {tableName});
    const primaryKey = model.primaryKey;
    const definition = model.attributes;
    const items = allValues.map(values => prepareInputData({definition, primaryKey, values}));
    const entities = items.map(item => {

      const pkValue = item[primaryKey];
      const key = gcDatastoreInstance.key([tableName, pkValue])

      delete item[primaryKey];

      return {
        key: key,
        data: item
      };

    });

    gcDatastoreInstance
      .save(entities)
      .then(() => {

        if (!s3q.meta.fetch) { return done(); }

        items.forEach((item, ind) => {

          item[primaryKey] = entities[ind].key.path[1];

        });

        done(null, items);

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

    const gcDatastoreInstance = registeredDsEntries[identity].manager;
    const model = _models[s3q.using];
    const definition = model.definition;
    const primaryKey = model.primaryKey;
    const item = {};
    let key;

    if (!values[primaryKey]) {

      let msg = `Missing or null value for property \`${key}\`.`;
      throw new TypeError(msg);

    }

    // Check that these exist
    for (key in values) {

      if (definition[key]) { item[key] = values[key]; }

    }

    // FIND entities first
    // node_modules/@google-cloud/datastore/src/request.js:1056

    // UPDATE entities

    gcDatastoreInstance
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
  destroy: function destroy(identity, s3q, done) {

    const tableName = s3q.using;
    const model = _.find(_models, {tableName});
    const primaryKey = model.primaryKey;
    const gcDatastoreInstance = registeredDsEntries[identity].manager;
    const key = gcDatastoreInstance.key([tableName]);

    s3q.criteria.select = [primaryKey];

    this.find(identity, s3q, (err, items) => {

      if (err) return done(err);

      const entitiesToDelete = items.map(item => {

        return gcDatastoreInstance.key([tableName, item[primaryKey]])

      });
      // Suspect keys are somehow different -_:)_-
      gcDatastoreInstance
        .delete(entitiesToDelete)
        .then(resp => done())
        .catch(done);

    });

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

    const gcDatastoreInstance = registeredDsEntries[identity].manager;
    const {
      using,
      criteria
    } = s3q;
    const query = gcDatastoreInstance.createQuery(using);
    const KEY_SYMBOL = gcDatastoreInstance.KEY;
    const tableName = s3q.using;
    const model = _.find(_models, {tableName});
    const primaryKey = model.primaryKey;
    let key;

    // @TODO Handle greater than / less than statements
    for (key in criteria.where) {

      query.filter(key, criteria.where[key]);

    }

    if (criteria.limit) {
      query.limit(Math.min(criteria.limit, 2147483647));
    }

    if (criteria.skip) {
      return done(new Error('Skip not implemented'));
    }

    return gcDatastoreInstance
      .runQuery(query)
      .then(resp => {

        const items = resp[0].map(entity => {

          let item;

          if (s3q.criteria.select && s3q.criteria.select.join() !== '*') {

            item = s3q.criteria.select.reduce((i, k) => {

              if (!_.isUndefined(entity[k])) { i[k] = entity[k]; }

              return i;

            }, {});

          } else {

            item = Object.assign({}, entity);
            delete item[KEY_SYMBOL];

          }

          item[primaryKey] = entity[KEY_SYMBOL].path[1];

          return item;

        });

        done(null, items);

      })
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

    /*const gcDatastoreInstance = registeredDsEntries[identity].manager;

    console.log(identity);
    console.log(tableName);
    console.log(modelDef);*/

    done();
  },
  // Destroy collection
  drop: (datastoreName, tableName, unused, done) => {



    done();
  },
  setSequence: (identity, sequenceName, sequenceValue, done) => {

    const datastore = registeredDsEntries[identity];

    datastore.sequences[sequenceName] = sequenceValue;

    done();

  }
};

/**
 * @param {Object} config
 * @param {Object} config.definition - Waterline Model Definition
 * @param {Object} config.values
 * @param {String} config.primaryKey
 *
 * @throws {TypeError} - null or undefined required data
 *
 * @returns {Object}
 */
function prepareInputData(config) {

  const { definition, values, primaryKey } = config;
  const item = {};
  let key;

  for (key in definition) {

    let attrDef = definition[key];
    let value = values[attrDef.columnName];

    if (_.isUndefined(value) && attrDef.defaultsTo) { value = attrDef.defaultsTo; };

    if (key === primaryKey || attrDef.required || attrDef.unique) {

      if (_.isUndefined(value)) {

        let msg = `Missing value for property \`${key}\`.`;
        throw new TypeError(msg);

      }

    }

    if (!_.isNull(value)) item[key] = value;

  }

  return item;

}

/**
 * @param {Object} config
 *
 * @returns {GoogleCloudDatastore#Query#Filter}
 */
function buildFilter(config) {

  /*"where": {
    "email": "dwilkerson@lunametrics.com"
  },*/
  return;

}
