exports.up = function(knex) {
  return knex.schema.createTable('invite_tokens', function(table) {
    table.increments('id').primary();
    table.string('token').notNullable().unique();
    table.integer('created_by').references('id').inTable('users');
    table.timestamp('expires_at').notNullable();
    table.timestamp('used_at').nullable();
    table.integer('used_by').references('id').inTable('users');
    table.integer('max_uses').defaultTo(1);
    table.integer('current_uses').defaultTo(0);
    table.boolean('is_indefinite').defaultTo(false);
    table.timestamp('last_renewed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('invite_tokens');
}; 