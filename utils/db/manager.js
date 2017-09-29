/* eslint no-console: "off" */

require('dotenv').config();
const db_connections = require('./db_connections'); /* eslint camelcase: "off" */
const knex = require('knex')(db_connections[process.env.NODE_ENV || 'development']);
const moment = require('moment-timezone')
/**
 * Postgres returns the absolute date string with local offset detemined by its timezone setting.
 * Knex by default creates a javascript Date object from this string.
 * This function overrides knex's default to instead returns an ISO 8601 string with local offset.
 * For more info: https://github.com/brianc/node-pg-types
 */
const TIMESTAMPTZ_OID = 1184;
require('pg').types.setTypeParser(TIMESTAMPTZ_OID, date => moment(date).tz(process.env.TZ).format());


/**
 * Set of instructions for creating tables needed by the courtbot application.
 *
 * @type {Object}
 */
const createTableInstructions = {
    cases() {
        return knex.schema.createTableIfNotExists('cases', (table) => {
            table.string('defendant', 100);
            table.timestamp('date');
            table.string('room', 100);
            table.string('citation_id', 100);
            table.primary(['id', 'date'])
            table.index('id')
        })
    },
    requests() {
        return knex.schema.createTableIfNotExists('requests', (table) => {
            table.timestamps(true, true)
            table.string('case_id', 100);
            table.string('phone', 100);
            table.primary(['case_id', 'phone'])
        });
    },
    notifications(){
        return knex.schema.createTableIfNotExists('notifications', (table) => {
            table.string('case_id');
            table.string('phone');
            table.timestamp('event_date');
            table.foreign(['case_id', 'phone']).onDelete('CASCADE').references(['case_id', 'phone' ]).inTable('requests')
        })
    }
};

/**
 * Insert chunk of data to table
 *
 * @param  {String} table Table to insert data to.
 * @param  {Array} rows Array of rows to insert into the table.
 * @param  {number} size number of rows to insert into the table at one time.
 * @return {Promise}
 */
function batchInsert(table, rows, size) {
  console.log('batch inserting', rows.length, 'rows');

  // had to explicitly use transaction for record counts in test cases to work
  return knex.transaction(trx => trx.batchInsert(table, rows, size)
    .then(trx.commit)
    .catch(trx.rollback));
}

/**
 * Manually close database connection.
 *
 * @return {void}
 */
function closeConnection() {
  return knex.client.pool.destroy();
}

/**
 * Create specified table if it does not already exist.
 *
 * @param  {String} table [description]
 * @param  {function} table (optional) function to be performed after table is created.
 * @return {Promise}  Promise to create table if it does not exist.
 */
function createTable(table) {
  console.log('Trying to create table:', table);
  if (!createTableInstructions[table]) {
    console.log(`No Table Creation Instructions found for table "${table}".`);
    return false;
  }

  return knex.schema.hasTable(table)
    .then((exists) => {
      if (exists) {
        return console.log(`Table "${table}" already exists.  Will not create.`);
      }

      return createTableInstructions[table]()
        .then(() => {
          console.log(`Table created: "${table}"`);
        });
    });
}

/**
 * Drop specified table
 *
 * @param  {String} table name of the table to be dropped.
 * @return {Promise}  Promise to drop the specified table.
 */
function dropTable(table) {
  return knex.schema.dropTableIfExists(table)
    .then(console.log(`Dropped existing table "${table}"`));
}

/**
 * Ensure all necessary tables exist.
 *
 * Note:  create logic only creates if a table does not exists, so it is enough to just
 *   call createTable() for each table.
 *
 * @return {Promise} Promise to ensure all courtbot tables exist.
 */
function ensureTablesExist() {
  return Promise.all(Object.keys(createTableInstructions).map(createTable));
}

module.exports = {
  ensureTablesExist,
  closeConnection,
  createTable,
  dropTable,
  batchInsert,
  knex,
};
