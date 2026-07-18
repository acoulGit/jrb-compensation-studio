import type {
  OrganizationProfile,
  OrganizationProfileInput,
} from "../types";

export interface OrganizationRepository {
  getProfile(): Promise<OrganizationProfile>;
  updateProfile(input: OrganizationProfileInput): Promise<OrganizationProfile>;
}
