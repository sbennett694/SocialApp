import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { evaluateText } from "../lib/moderationEngine";

export async function checkContent(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = event.body ? JSON.parse(event.body) : {};
  const text = (body.text ?? "") as string;

  const decision = evaluateText(text);

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(decision)
  };
}
