#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

async function setupLocalPostgreSQL() {
  console.log('🗄️ Setting up Local PostgreSQL...\n');
  
  try {
    // Add PostgreSQL to PATH
    process.env.PATH += ';C:\\Program Files\\PostgreSQL\\17\\bin';
    
    console.log('1. Checking PostgreSQL installation...');
    const { stdout: version } = await execAsync('psql --version');
    console.log('✅ PostgreSQL found:', version.trim());
    
    console.log('\n2. Creating database...');
    try {
      await execAsync('createdb -U postgres media_server');
      console.log('✅ Database "media_server" created');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️ Database "media_server" already exists');
      } else {
        console.log('⚠️ Database creation failed, continuing...');
      }
    }
    
    console.log('\n3. Creating user...');
    try {
      await execAsync('psql -U postgres -d media_server -c "CREATE USER media_user WITH PASSWORD \'media_password\';"');
      console.log('✅ User "media_user" created');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️ User "media_user" already exists');
      } else {
        console.log('⚠️ User creation failed, continuing...');
      }
    }
    
    console.log('\n4. Granting permissions...');
    try {
      await execAsync('psql -U postgres -d media_server -c "GRANT ALL PRIVILEGES ON DATABASE media_server TO media_user;"');
      await execAsync('psql -U postgres -d media_server -c "GRANT ALL ON SCHEMA public TO media_user;"');
      console.log('✅ Permissions granted');
    } catch (error) {
      console.log('⚠️ Permission grant failed, continuing...');
    }
    
    console.log('\n5. Creating environment file...');
    const envContent = `# Local PostgreSQL Configuration
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=media_server
DB_USER=media_user
DB_PASSWORD=media_password
NODE_ENV=development
`;
    
    await fs.writeFile('.env.postgresql-local', envContent);
    console.log('✅ Environment file created: .env.postgresql-local');
    
    console.log('\n🎉 Local PostgreSQL setup completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Copy the contents of .env.postgresql-local to your .env file');
    console.log('2. Run: npm run db:test-connection');
    console.log('3. If successful, run: npm run db:migrate-to-postgresql');
    console.log('4. Test your application: npm run dev');
    
    console.log('\n⚠️ Important:');
    console.log('- Default password is "media_password" - change this for production');
    console.log('- PostgreSQL is running on localhost:5432');
    console.log('- You can switch back to SQLite by setting DB_TYPE=sqlite in .env');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.log('\n💡 Manual setup instructions:');
    console.log('1. Open Command Prompt as Administrator');
    console.log('2. Run: "C:\\Program Files\\PostgreSQL\\17\\bin\\createdb.exe" -U postgres media_server');
    console.log('3. Run: "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe" -U postgres -d media_server');
    console.log('4. In psql, run: CREATE USER media_user WITH PASSWORD \'media_password\';');
    console.log('5. Then: GRANT ALL PRIVILEGES ON DATABASE media_server TO media_user;');
    console.log('6. Finally: GRANT ALL ON SCHEMA public TO media_user;');
  }
}

// Run setup if called directly
if (require.main === module) {
  setupLocalPostgreSQL()
    .then(() => {
      console.log('\n✅ Setup completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupLocalPostgreSQL; 