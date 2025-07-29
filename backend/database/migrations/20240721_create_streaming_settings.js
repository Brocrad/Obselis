exports.up = function(knex) {
  return knex.schema.createTable('streaming_settings', function(table) {
    table.increments('id').primary();
    table.string('max_resolution').defaultTo('1080p'); // 480p, 720p, 1080p, 4k
    table.string('bitrate_limit').defaultTo('20'); // Mbps
    table.string('total_bandwidth_limit').defaultTo('150'); // GB
    table.string('per_user_bandwidth_limit').defaultTo('25'); // GB
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('streaming_settings');
}; 