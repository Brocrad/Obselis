exports.up = function(knex) {
  return knex.schema
    .createTable('password_resets', function(table) {
      table.increments('id').primary();
      table.string('email').notNullable();
      table.string('token').notNullable().unique();
      table.timestamp('expires_at').notNullable();
      table.boolean('used').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('password_changes', function(table) {
      table.increments('id').primary();
      table.integer('user_id').notNullable().references('id').inTable('users');
      table.string('email').notNullable();
      table.string('token').notNullable().unique();
      table.timestamp('expires_at').notNullable();
      table.boolean('used').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTable('password_changes')
    .dropTable('password_resets');
}; 