import type { OrganizationRepository } from "../infrastructure/database/repositories/organizationRepository";
import type {
  OrganizationProfile,
  OrganizationProfileInput,
} from "../infrastructure/database/types";
import { AppError } from "./errors";

export class OrganizationService {
  constructor(private readonly repository: OrganizationRepository) {}

  getProfile(): Promise<OrganizationProfile> {
    return this.repository.getProfile();
  }

  async updateProfile(
    input: OrganizationProfileInput,
  ): Promise<OrganizationProfile> {
    const normalized = normalizeOrganizationInput(input);
    validateOrganizationInput(normalized);
    return this.repository.updateProfile(normalized);
  }
}

export function normalizeOrganizationInput(
  input: OrganizationProfileInput,
): OrganizationProfileInput {
  return {
    productName: input.productName.trim(),
    organizationName: input.organizationName.trim(),
    organizationShortName: input.organizationShortName.trim(),
    applicationSubtitle: input.applicationSubtitle.trim(),
    reportFooter: input.reportFooter.trim(),
  };
}

export function validateOrganizationInput(
  input: OrganizationProfileInput,
): void {
  const required: Array<keyof OrganizationProfileInput> = [
    "productName",
    "organizationName",
    "organizationShortName",
    "applicationSubtitle",
    "reportFooter",
  ];

  for (const key of required) {
    if (!input[key]) {
      throw new AppError(
        "VALIDATION",
        "Tous les champs d’identité de l’organisation sont obligatoires.",
      );
    }
  }
}
