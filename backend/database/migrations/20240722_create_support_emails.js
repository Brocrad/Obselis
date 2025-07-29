exports.up = function(knex) {
  return knex.schema.createTable('support_emails', function(table) {
    table.increments('id').primary();
    table.string('email').notNullable().unique();
    table.string('name').nullable(); // Optional name/description
    table.integer('added_by').references('id').inTable('users'); // Admin who added it
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('support_emails');
}; 