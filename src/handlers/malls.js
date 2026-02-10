const { ScanCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb } = require("../ddb");

const TABLE = process.env.DDB_TABLE;

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    },
    body: JSON.stringify(body)
  };
}

module.exports.list = async () => {
  try {
    const data = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: "#sk = :meta",
      ExpressionAttributeNames: { "#sk": "sk" },
      ExpressionAttributeValues: { ":meta": "META" }
    }));

    const items = (data.Items || []).map(it => ({
      mallKey: String(it.pk || "").replace("MALL#", ""),
      mallName: it.mallName,
      city: it.city,
      state: it.state,
      productsCount: Array.isArray(it.products) ? it.products.length : 0
    }));

    return response(200, { items });
  } catch (err) {
    return response(500, { error: String(err) });
  }
};

module.exports.get = async (event) => {
  try {
    const mallKey = event?.pathParameters?.mallKey;
    if (!mallKey) return response(400, { error: "mallKey is required" });

    const data = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { pk: `MALL#${mallKey}`, sk: "META" }
    }));

    if (!data.Item) return response(404, { error: "Not found" });
    return response(200, data.Item);
  } catch (err) {
    return response(500, { error: String(err) });
  }
};
