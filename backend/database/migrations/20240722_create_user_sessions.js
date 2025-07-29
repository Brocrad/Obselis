exports.up = function(knex) {
  return knex.schema.createTable('user_sessions', function(table) {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users');
    table.string('session_id').notNullable().unique();
    table.string('device_info').nullable();
    table.string('browser_info').nullable();
    table.string('ip_address').nullable();
    table.string('location').nullable();
    table.string('user_agent').nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_activity').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').notNullable();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('user_sessions');
}; 