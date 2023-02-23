const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');
const app = require('express')();
const { Dropbox } = require('dropbox');
require('dotenv').config();

// Host config
const hostname = process.env.HOST || 'localhost';
const port = process.env.PORT || '3000';

// DBX Config
const dbxConfig = {
  fetch,
  clientId: process.env.DBX_KEY,
  clientSecret: process.env.DBX_SECRET,
};
const dbx = new Dropbox(dbxConfig);
const dbxTokenFile = process.env.DBX_TOKEN_FILE || '.token';
const dbxRedirectUri = `http://${hostname}:${port}/auth/dropbox/callback`;

// Database Directory
const dbDumpDir = process.env.DB_DUMP_DIR || 'db-dumps';

function getLocalAccessToken() {
  return new Promise((resolve, reject) => {
    let token;
    try {
      const tokenString = fs.readFileSync(dbxTokenFile, 'utf8');
      token = JSON.parse(tokenString);
    } catch (error) {
      reject(error);
    }

    if (token.expires_at < Date.now()) {
      console.log('Token has expired. Refreshing...');
      dbx.auth
        .getTokenFromRefreshToken(token.refresh_token)
        .then((newToken) => {
          token = newToken.result;
          token.expires_at = Date.now() + token.expires_in * 1000;
          fs.writeFileSync(dbxTokenFile, JSON.stringify(token));
          resolve(token);
        })
        .catch((error) => {
          console.error('Error refreshing token:', error);
          reject(error);
        });
    } else {
      resolve(token);
    }
  });
}

function createDbDump() {
  return new Promise((resolve, reject) => {
    const dumpDirFullPath = path.join(os.homedir(), dbDumpDir);
    const fileName = `${new Date()
      .toLocaleString()
      .replace(/[-:]/g, '-')
      .replace(/\//g, '-')
      .replace(', ', '-')}.sql`;
    const filePath = path.join(dumpDirFullPath, fileName);
    const dbUser = process.env.DB_USER;
    const dbPass = process.env.DB_PASS;
    const dbName = process.env.DB_NAME;
    const dumpCommand = `mysqldump -u ${dbUser} -p${dbPass} ${dbName} > ${filePath}`;

    exec(dumpCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error creating database dump: ${error}`);
        reject(error);
        return;
      }

      console.log(`New DBDump saved to ${filePath}`);
      resolve(filePath);
    });
  });
}

// Routes

app.get('/', (req, res) => {
  // Get all routes
  const routes = app._router.stack
    .filter((layer) => layer.route) // Filter out middleware functions
    .map(
      (layer) =>
        `${Object.keys(layer.route.methods).map((method) =>
          method.toUpperCase()
        )} : http://${hostname}:${port}${layer.route.path}`
    );

  res.send(routes);
});

// Login with DropBox
app.get('/auth/dropbox', (req, res) => {
  dbx.auth
    .getAuthenticationUrl(dbxRedirectUri, null, 'code', 'offline', null, 'none', false)
    .then((authUrl) => {
      res.writeHead(302, { Location: authUrl });
      res.end();
    });
});

// Store token object in tokenFile
app.get('/auth/dropbox/callback', (req, res) => {
  const { code } = req.query;

  dbx.auth
    .getAccessTokenFromCode(dbxRedirectUri, code)
    .then((token) => {
      fs.writeFileSync(dbxTokenFile, JSON.stringify(token.result));
      res.send({ token: token.result });
    })
    .catch((error) => {
      console.log(error);
    });
});

// Check if authenticated
app.get('/auth/is-authenticated', async (req, res) => {
  try {
    let accessToken = await getLocalAccessToken();
    res.send(accessToken);
  } catch (error) {
    res.redirect('/auth/dropbox');
  }
});

// Backup DBDumps to DBx
app.get('/backup-db', async (req, res) => {
  let token;
  try {
    token = await getLocalAccessToken();
  } catch (error) {
    res.redirect('/auth/dropbox');
  }

  // Create a dump
  await createDbDump();

  const ignoreFiles = ['.DS_Store'];
  const dbDumpFullPath = path.join(os.homedir(), dbDumpDir);
  const backupDir = '/retna_db_backups';

  // List files in db-dumps directory and sort by creation time
  fs.readdir(dbDumpFullPath, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      res.status(500).send('Error reading directory');
      return;
    }

    const latestFile = files
      .filter((file) => file.isFile() && !ignoreFiles.includes(file.name))
      .map((file) => ({
        ...file,
        ctime: fs.statSync(path.join(dbDumpFullPath, file.name)).ctime,
      }))
      .sort((a, b) => b.ctime - a.ctime)[0];

    if (!latestFile) {
      console.error('No files found in directory');
      res.status(404).send('No files found');
      return;
    }

    const uploadPath = path.join(backupDir, latestFile.name);
    const fileStream = fs.createReadStream(path.join(dbDumpFullPath, latestFile.name));

    dbx.auth.setRefreshToken(token.refresh_token);
    dbx
      .filesUpload({ path: uploadPath, contents: fileStream })
      .then((response) => {
        console.log(`New Backup uploaded at: ${response.result.path_lower}`);
        res.send({ message: 'File backed up', result: response.result });
      })
      .catch((error) => {
        console.error('Error uploading file:', JSON.stringify(error.error));
        res.status(500).send('Error uploading file');
      });
  });
});

app.listen(port);
console.clear();
console.log(`Application started at http://localhost:${port}`);
