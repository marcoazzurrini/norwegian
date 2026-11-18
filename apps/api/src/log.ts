// Structured logs. Workers Logs indexes the fields of a logged object, so each can be searched.
// Fields are counts, statuses and ids only: never an email address, a token or what the learner studied.

type Fields = Record<string, boolean | number | string | null>;

export const logInfo = (event: string, fields: Fields = {}) => {
  console.log({ event, ...fields });
};

export const logWarning = (event: string, fields: Fields = {}) => {
  console.warn({ event, ...fields });
};

export const logError = (event: string, fields: Fields = {}) => {
  console.error({ event, ...fields });
};
