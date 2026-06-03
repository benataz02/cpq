export * from './client.js';
export * from './config.js';
export { defaultDispatcher, type Dispatcher } from './transport.js';
// Re-export the SAP DTO boundary from the contract so consumers get the client
// and its schemas from one import — the canonical SessionSchema lives in @cpq/contract.
export { SessionSchema, type Session } from '@cpq/contract';
