import { AIContentGenerationRequest, AIContentGenerationResult, AILeadScoreResult, LeadRecord } from '../types';

export class ApiService {
  static async fetchNearbyFacilities(
    lat: number,
    lon: number,
    radiusMiles: number,
    category: string = 'All'
  ): Promise<{ facilities: LeadRecord[]; totalFound: number; isLiveOverpass: boolean }> {
    try {
      const response = await fetch(
        `/api/overpass/facilities?lat=${lat}&lon=${lon}&radiusMiles=${radiusMiles}&category=${encodeURIComponent(category)}`
      );
      if (!response.ok) {
        return {
          facilities: [],
          totalFound: 0,
          isLiveOverpass: false,
        };
      }
      const data = await response.json();
      return {
        facilities: data.facilities || [],
        totalFound: data.totalFound || 0,
        isLiveOverpass: data.isLiveOverpass || false,
      };
    } catch {
      return {
        facilities: [],
        totalFound: 0,
        isLiveOverpass: false,
      };
    }
  }

  static async generateAICampaign(request: AIContentGenerationRequest): Promise<AIContentGenerationResult> {
    try {
      const response = await fetch('/api/ai/generate-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${response.status}`);
      }

      const resData = await response.json();
      return resData.data;
    } catch (error) {
      console.error('ApiService.generateAICampaign failed:', error);
      throw error;
    }
  }

  static async scoreLead(lead: Partial<LeadRecord>): Promise<AILeadScoreResult> {
    try {
      const response = await fetch('/api/ai/score-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospitalName: lead.hospitalName,
          referralType: lead.referralType,
          distanceValleyVillage: lead.distanceValleyVillage || 5,
          notes: lead.notes,
          address: lead.address,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${response.status}`);
      }

      const resData = await response.json();
      return resData.data;
    } catch (error) {
      console.error('ApiService.scoreLead failed:', error);
      throw error;
    }
  }

  static async generateWeeklyBatch(): Promise<{
    monday: { subject: string; preview: string; body: string; cta: string };
    wednesday: { subject: string; preview: string; body: string; cta: string };
    friday: { subject: string; preview: string; body: string; cta: string };
  }> {
    try {
      const response = await fetch('/api/ai/batch-weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Weekly batch generation failed');
      }

      const resData = await response.json();
      return resData.data;
    } catch (error) {
      console.error('ApiService.generateWeeklyBatch failed:', error);
      throw error;
    }
  }
}
