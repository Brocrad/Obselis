exports.up = function(knex) {
  return knex.schema.createTable('email_verifications', function(table) {
    table.increments('id').primary();
    table.string('email').notNullable();
    table.string('code').notNullable();
    table.string('username').notNullable();
    table.string('password_hash').notNullable();
    table.string('invite_token').notNullable();
    table.timestamp('expires_at').notNullable();
    table.boolean('verified').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('email_verifications');
}; 