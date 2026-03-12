-- Add lo_code to learning_outcomes table
ALTER TABLE learning_outcomes ADD COLUMN lo_code VARCHAR(50);

-- Drop plain_password column from tables for security
ALTER TABLE users_teachers DROP COLUMN IF EXISTS plain_password;
ALTER TABLE users_students DROP COLUMN IF EXISTS plain_password;
