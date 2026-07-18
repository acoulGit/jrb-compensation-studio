import {
  DEFAULT_ORGANIZATION_SEED,
  type OrganizationProfile,
  type OrganizationProfileInput,
} from "../types";
import type { OrganizationRepository } from "./organizationRepository";

export class MemoryOrganizationRepository implements OrganizationRepository {
  private profile: OrganizationProfile;

  constructor(seed?: OrganizationProfile) {
    const now = "1970-01-01T00:00:00.000Z";
    this.profile =
      seed ??
      ({
        ...DEFAULT_ORGANIZATION_SEED,
        createdAt: now,
        updatedAt: now,
      } satisfies OrganizationProfile);
  }

  async getProfile(): Promise<OrganizationProfile> {
    return { ...this.profile };
  }

  async updateProfile(
    input: OrganizationProfileInput,
  ): Promise<OrganizationProfile> {
    this.profile = {
      ...this.profile,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    return this.getProfile();
  }
}
