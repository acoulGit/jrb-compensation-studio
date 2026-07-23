export type {
  ChangeLocalPasswordInput,
  LocalAccessOutcome,
  LocalAccessStatusDto,
  LocalAccessVoidOutcome,
  SetupLocalAccessInput,
  UnlockLocalAccessInput,
} from "./localAccessModels";
export {
  changeLocalPassword,
  getLocalAccessStatus,
  lockLocalAccess,
  setupLocalAccess,
  unlockLocalAccess,
} from "./localAccessService";
