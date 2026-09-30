import { Campaign, ContactPerson, LeadRecord, OutreachEvent, FacilityLocation } from '../types';
import { INITIAL_CAMPAIGNS, INITIAL_CONTACTS, INITIAL_LEADS, ANGELS_OASIS_LOCATIONS } from '../data/initialData';

const LEADS_STORAGE_KEY = 'angels_oasis_leads_v1';
const CONTACTS_STORAGE_KEY = 'angels_oasis_contacts_v1';
const CAMPAIGNS_STORAGE_KEY = 'angels_oasis_campaigns_v1';
const OUTREACH_STORAGE_KEY = 'angels_oasis_outreach_v1';

export class StorageService {
  static getLeads(): LeadRecord[] {
    try {
      const stored = localStorage.getItem(LEADS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load leads from localStorage', e);
    }
    this.saveLeads(INITIAL_LEADS);
    return INITIAL_LEADS;
  }

  static saveLeads(leads: LeadRecord[]): void {
    try {
      localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
    } catch (e) {
      console.error('Failed to save leads', e);
    }
  }

  static addLead(lead: Omit<LeadRecord, 'id' | 'outreachHistory'>): LeadRecord {
    const leads = this.getLeads();
    const newLead: LeadRecord = {
      ...lead,
      id: `lead-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      outreachHistory: []
    };
    leads.unshift(newLead);
    this.saveLeads(leads);
    return newLead;
  }

  static updateLead(id: string, updates: Partial<LeadRecord>): LeadRecord | null {
    const leads = this.getLeads();
    const index = leads.findIndex(l => l.id === id);
    if (index === -1) return null;
    leads[index] = { ...leads[index], ...updates };
    this.saveLeads(leads);
    return leads[index];
  }

  static deleteLead(id: string): boolean {
    const leads = this.getLeads();
    const filtered = leads.filter(l => l.id !== id);
    if (filtered.length !== leads.length) {
      this.saveLeads(filtered);
      return true;
    }
    return false;
  }

  static getContacts(): ContactPerson[] {
    try {
      const stored = localStorage.getItem(CONTACTS_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to load contacts', e);
    }
    this.saveContacts(INITIAL_CONTACTS);
    return INITIAL_CONTACTS;
  }

  static saveContacts(contacts: ContactPerson[]): void {
    try {
      localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    } catch (e) {
      console.error('Failed to save contacts', e);
    }
  }

  static addContact(contact: Omit<ContactPerson, 'id'>): ContactPerson {
    const contacts = this.getContacts();
    const newContact: ContactPerson = {
      ...contact,
      id: `ct-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    contacts.unshift(newContact);
    this.saveContacts(contacts);
    return newContact;
  }

  static getCampaigns(): Campaign[] {
    try {
      const stored = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to load campaigns', e);
    }
    this.saveCampaigns(INITIAL_CAMPAIGNS);
    return INITIAL_CAMPAIGNS;
  }

  static saveCampaigns(campaigns: Campaign[]): void {
    try {
      localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
    } catch (e) {
      console.error('Failed to save campaigns', e);
    }
  }

  static recordOutreachSend(
    leadId: string,
    campaignName: string,
    subject: string,
    recipientEmail: string,
    recipientName: string,
    previewText?: string
  ): OutreachEvent {
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 16);

    const event: OutreachEvent = {
      id: `out-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      leadId,
      campaignName,
      subject,
      sentAt: dateStr,
      status: 'sent',
      recipientEmail,
      recipientName,
      previewText
    };

    // Update lead record
    const leads = this.getLeads();
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      if (!lead.outreachHistory) lead.outreachHistory = [];
      lead.outreachHistory.unshift(event);
      lead.lastContacted = dateStr.split(' ')[0];
      if (lead.status === 'New' || lead.status === 'Researched') {
        lead.status = 'Contacted';
      }
      this.saveLeads(leads);
    }

    // Update campaign counters
    const campaigns = this.getCampaigns();
    const campaign = campaigns.find(c => c.name.toLowerCase().includes(campaignName.toLowerCase()) || campaignName.toLowerCase().includes(c.day.toLowerCase()));
    if (campaign) {
      campaign.sentCount += 1;
      this.saveCampaigns(campaigns);
    }

    return event;
  }

  static updateOutreachStatus(leadId: string, eventId: string, status: OutreachEvent['status']): void {
    const leads = this.getLeads();
    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.outreachHistory) {
      const event = lead.outreachHistory.find(e => e.id === eventId);
      if (event) {
        event.status = status;
        const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
        if (status === 'opened') event.openedAt = now;
        if (status === 'clicked') event.clickedAt = now;
        if (status === 'replied') {
          event.repliedAt = now;
          if (lead.status === 'Contacted') lead.status = 'Engaged';
        }
        this.saveLeads(leads);
      }
    }
  }

  static resetToDefault(): void {
    localStorage.removeItem(LEADS_STORAGE_KEY);
    localStorage.removeItem(CONTACTS_STORAGE_KEY);
    localStorage.removeItem(CAMPAIGNS_STORAGE_KEY);
    localStorage.removeItem(OUTREACH_STORAGE_KEY);
  }
}
