
const AWS = require('aws-sdk');



const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });
const systemMessage = `You are a css specialist on tailwind. We only support tailwind css. Be super concise.
Reply to users with the list of classes needed to add their behavior. For example if they ask for a large text with blue background you
can reply with the format \`text-lg bg-blue-500\` include them always in
`;

exports.handler = async (event) => {
  const { ChatGPTAPI } = await import("chatgpt");
  let api = new ChatGPTAPI({
    apiKey: process.env.CHATGPT_API,
    model: "gpt-3.5-turbo",
  });

  const tableName = process.env.TABLE_NAME;

  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: process.env.ENDPOINT_URL,
  });

  const postData = JSON.parse(event.body).data;
  const connectionId = event["requestContext"]["connectionId"];

  try {
    const res = await api.sendMessage(postData.toString(), { systemMessage })
    await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: res.text }).promise();
  } catch (e) {
    if (e.statusCode === 410) {
      console.log(`Found stale connection, deleting ${connectionId}`);
      await ddb.delete({ TableName: tableName, Key: { ConnectionId: connectionId } }).promise();
    } else {
      throw e;
    }
  }

  return { statusCode: 200, body: 'Data sent.' };
};