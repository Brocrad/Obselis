exports.up = function(knex) {
  return knex.schema.createTable('monthly_bandwidth', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.string('username');
    table.float('total_bandwidth_gb').defaultTo(0); // Total bandwidth used in GB
    table.integer('total_streams').defaultTo(0); // Number of streams
    table.integer('total_duration_seconds').defaultTo(0); // Total watch time in seconds
    table.date('period_start').notNullable(); // Start of 30-day period (YYYY-MM-DD)
    table.date('period_end').notNullable(); // End of 30-day period (YYYY-MM-DD)
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Index for efficient queries
    table.index(['user_id', 'period_start']);
    table.index(['period_start', 'period_end']);
    
    // Ensure one record per user per period
    table.unique(['user_id', 'period_start']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('monthly_bandwidth');
}; 