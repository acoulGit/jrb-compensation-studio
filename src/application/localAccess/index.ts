export type {
  ActivateOfflineLicenseInput,
  ChangeLocalPasswordInput,
  LicenseActivationDto,
  LicenseActivationOutcome,
  LocalAccessOutcome,
  LocalAccessStatusDto,
  LocalAccessVoidOutcome,
  SetupLocalAccessInput,
  UnlockLocalAccessInput,
} from "./localAccessModels";
export {
  activateOfflineLicense,
  changeLocalPassword,
  getLocalAccessStatus,
  lockLocalAccess,
  setupLocalAccess,
  unlockLocalAccess,
} from "./localAccessService";
