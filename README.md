# Dbx Harbor

## Introduction
Dbx Harbor is a backup tool for Dropbox users. It provides a secure and hassle-free way to backup your database to your Dropbox account.

## Installation
To install Dbx Harbor, follow these simple steps:

1. Run `yarn install` to install all the required dependencies.
2. Copy the `.env.sample` file and rename it to `.env`. Edit the file and add your Dropbox API key and other necessary configurations.
3. Run `pm2 start index.js --name Dbx-harbor` to start the application. You can change the name "Dbx-harbor" to any other name you prefer.

NB: Backups happen every 6hrs but you can edit this in the .env

And that's it! Dbx Harbor should now be up and running, providing you with secure and reliable backups for your valuable data.

## Credits
Dbx Harbor was created by [Adedoyin Akande] and is licensed under the [MIT License](https://opensource.org/licenses/MIT).
If you have any questions or feedback do raise an issue.
