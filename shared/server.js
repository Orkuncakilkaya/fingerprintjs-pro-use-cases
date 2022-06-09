// Demo origins.
// It is recommended to use production origins instead.
export const ourOrigins = ['https://fingerprinthub.com', 'https://localhost:3000', 'http://localhost:3000'];

export const messageSeverity = Object.freeze({
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
});

export class CheckResult {
  constructor(message, messageSeverity, type) {
    this.message = message;
    this.messageSeverity = messageSeverity;
    this.type = type;
  }
}

export const checkResultType = Object.freeze({
  LowConfidenceScore: 'LowConfidenceScore',
  RequestIdMissmatch: 'RequestIdMissmatch',
  OldTimestamp: 'OldTimestamp',
  TooManyLoginAttempts: 'TooManyLoginAttempts',
  TooManyChargebacks: 'TooManyChargebacks',
  IncorrectCredentials: 'IncorrectCredentials',
  IncorrectCardDetails: 'IncorrectCardDetails',
  Challenged: 'Challenged',
  ForeignOrigin: 'ForeignOrigin',
  IpMismatch: 'IpMismatch',
  Passed: 'Passed',
});

// Validates format of visitorId and requestId.
export function areVisitorIdAndRequestIdValid(visitorId, requestId) {
  const isVisitorIdFormatValid = /^[a-zA-Z0-9]{20}$/.test(visitorId);
  const isRequestIdFormatValid = /^\d{13}\.[a-zA-Z0-9]{6}$/.test(requestId);
  return isRequestIdFormatValid && isVisitorIdFormatValid;
}

// Every identification request should be validated using the FingerprintJS Pro Server API.
// Alternatively, on the Node.js environment one can use Server API Node.js library: https://github.com/fingerprintjs/fingerprintjs-pro-server-api-node-sdk
// const client = new FingerprintJsServerApiClient({
//   region: Region.Global,
//   apiKey: 'F6gQ8H8vQLc7mVsVKaFx',
//   authenticationMode: AuthenticationMode.QueryParameter,
// });

// const serverApiFilter = { request_id: requestId };
// const visitorData = await client.getVisitorHistory(
//   visitorId,
//   serverApiFilter
// );
// return visitorData;
export async function getVisitorData(visitorId, requestId) {
  // Do not request Server API if provided data is obviously forged,
  // return an error instead.
  if (!visitorId || !requestId) {
    return { error: 'visitorId or requestId not provided.' };
  }

  const fingerprintJSProServerApiUrl = new URL(`https://api.fpjs.io/visitors/${visitorId}`);

  fingerprintJSProServerApiUrl.searchParams.append(
    'api_key',
    // In a real world use-case, we recommend using Auth-API-Key header instead: https://dev.fingerprintjs.com/docs/server-api#api-methods.
    // The API key should be stored in the environment variables/secrets.
    'F6gQ8H8vQLc7mVsVKaFx'
  );
  fingerprintJSProServerApiUrl.searchParams.append('request_id', requestId);

  const visitorServerApiResponse = await fetch(fingerprintJSProServerApiUrl.href);

  // If there's something wrong with provided data, Server API might return non 200 response.
  // We consider these data unreliable.
  if (visitorServerApiResponse.status !== 200) {
    return { error: 'Server API error.' };
  }

  return await visitorServerApiResponse.json();
}

export function checkFreshIdentificationRequest(visitorData) {
  // The Server API must contain information about this specific identification request.
  // If not, the request might have been tampered with and we don't trust this identification attempt.
  if (visitorData.error || visitorData.visits.length !== 1) {
    return new CheckResult(
      'Hmmm, sneaky trying to forge information from the client-side, no luck this time, no sensitive action was performed.',
      messageSeverity.Error,
      checkResultType.RequestIdMissmatch
    );
  }

  // An attacker might have acquired a valid requestId and visitorId via phishing.
  // It's recommended to check freshness of the identification request to prevent replay attacks.
  if (new Date().getTime() - visitorData.visits[0].timestamp > 3000) {
    return new CheckResult(
      'Old requestId detected. Action ignored and logged.',
      messageSeverity.Error,
      checkResultType.OldTimestamp
    );
  }
}

// The Confidence Score reflects the system's degree of certainty that the visitor identifier is correct.
// If it's lower than the certain threshold we recommend using an additional way of verification, e.g. 2FA or email.
// More info: https://dev.fingerprintjs.com/docs/understanding-your-confidence-score
export function checkConfidenceScore(visitorData) {
  if (visitorData.visits[0].confidence.score < 0.98) {
    return new CheckResult(
      "Low confidence score, we'd rather verify you with the second factor,",
      messageSeverity.Error,
      checkResultType.LowConfidenceScore
    );
  }
}

// Checks if the authentication request comes from the same IP adress as the identification request.
export function checkIpAddressIntegrity(visitorData, request) {
  if (
    process.env.NODE_ENV !== 'development' && // This check is disabled on purpose in the Stackblitz and localhost environments.
    // This is an example of obtaining the client IP address.
    // In most cases, it's a good idea to look for the right-most external IP address in the list to prevent spoofing.
    request.headers['x-forwarded-for'].split(',')[0] !== visitorData.visits[0].ip
  ) {
    return new CheckResult(
      'IP mismatch. An attacker might have tried to phish the victim.',
      messageSeverity.Error,
      checkResultType.IpMismatch
    );
  }
}

// Checks if the authentication request comes from a known origin and
// if the authentication request's origin corresponds to the origin/URL provided by the FingerprintJSPro Server API.
// Additionally, one should set Request Filtering settings in the dashboard: https://dev.fingerprintjs.com/docs/request-filtering
export function checkOriginsIntegrity(visitorData, request) {
  const visitorDataOrigin = new URL(visitorData.visits[0].url).origin;
  if (
    process.env.NODE_ENV !== 'development' && // This check is disabled on purpose in the Stackblitz and localhost environments.
    (visitorDataOrigin !== request.headers['origin'] ||
      !ourOrigins.includes(visitorDataOrigin) ||
      !ourOrigins.includes(request.headers['origin']))
  ) {
    return new CheckResult(
      'Origin mismatch. An attacker might have tried to phish the victim.',
      messageSeverity.Error,
      checkResultType.ForeignOrigin
    );
  }
}

export function getOkReponse(res, message, messageSeverity) {
  return res.status(200).json({ message, severity: messageSeverity });
}

export function getForbiddenReponse(res, message, messageSeverity) {
  return res.status(403).json({ message, severity: messageSeverity });
}

// Report suspicious user activity according to internal processes here.
// Possibly this action could also lock the user's account temporarily or ban a specific action.
export function reportSuspiciousActivity(context) {}