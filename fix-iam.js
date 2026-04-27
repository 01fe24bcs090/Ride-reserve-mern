const { GoogleAuth } = require('google-auth-library');

async function main() {
  const auth = new GoogleAuth({
    keyFile: 'service-account.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const client = await auth.getClient();
  const projectId = await auth.getProjectId();
  
  const url = `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/us-central1/functions/lookupTrain:getIamPolicy`;
  
  try {
    const res = await client.request({ url, method: 'GET' });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Error getting IAM policy:', err.message);
  }
}

main();
