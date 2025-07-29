exports.up = function(knex) {
  return knex.schema.createTable('streaming_sessions', function(table) {
    table.string('id').primary(); // sessionId
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.string('username');
    table.integer('media_id').unsigned();
    table.string('title');
    table.string('quality');
    table.float('bandwidth');
    table.timestamp('start_time').defaultTo(knex.fn.now());
    table.timestamp('end_time').nullable();
    table.string('client_ip');
    table.string('status').defaultTo('active'); // active, ended, terminated
    table.float('duration').nullable(); // seconds
    table.json('settings').nullable(); // store quality/bitrate/bandwidth limits
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('streaming_sessions');
}; 