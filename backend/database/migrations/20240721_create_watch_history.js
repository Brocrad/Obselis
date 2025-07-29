exports.up = function(knex) {
  return knex.schema.createTable('watch_history', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('media_id').unsigned().notNullable();
    table.string('title').notNullable();
    table.float('current_time').defaultTo(0); // seconds
    table.float('duration').notNullable(); // total duration in seconds
    table.float('progress_percentage').defaultTo(0); // 0-100
    table.boolean('completed').defaultTo(false);
    table.timestamp('last_watched').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Ensure one record per user per media
    table.unique(['user_id', 'media_id']);
    
    // Indexes for performance
    table.index(['user_id', 'last_watched']);
    table.index(['media_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('watch_history');
}; 