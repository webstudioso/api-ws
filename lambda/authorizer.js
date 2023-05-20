const { Magic } = require('@magic-sdk/admin');
const mAdmin = new Magic(process.env.MAGIC);

exports.main = async (event, context) => {

    let policyAccess = 'Deny';
    const DIDToken = event.authorizationToken.substring(7);
    try {
      mAdmin.token.validate(DIDToken);
      policyAccess = 'Allow';
      console.log(`Valid token for request`);
    } catch (e) {
      console.log(`[ERROR MAGICLINK] ${e} for token ${DIDToken}`);
    }

    let policy = {
      "principalId": "user",
      "policyDocument": {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Action": "execute-api:Invoke",
            "Effect": policyAccess,
            "Resource": "*"
          }
        ]
      }
    }
    return policy
}