import React, { useState } from 'react';
import { submitProfile } from '../utils/api';
import { User, IndianRupee, Clock } from 'lucide-react';

interface ProfileFormProps {
  sessionId: string;
  onComplete: () => void;
}

export default function ProfileForm({ sessionId, onComplete }: ProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    monthly_income: '',
    loan_amount_needed: '',
    preferred_tenure_months: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await submitProfile({
        session_id: sessionId,
        monthly_income: Number(formData.monthly_income),
        loan_amount_needed: Number(formData.loan_amount_needed),
        preferred_tenure_months: Number(formData.preferred_tenure_months),
      });
      onComplete();
    } catch (error) {
      console.error(error);
      alert('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-xl shadow-lg border border-gray-100">
      <div className="text-center mb-8">
        <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
          <User size={32} />
        </div>
        <h2 className="text-2xl font-bold font-heading text-gray-900">Personalize Your AI</h2>
        <p className="text-gray-500 mt-2 text-sm">Tell us a bit about your financial requirements to receive contextual, personalized risk assessments.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Monthly Income</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-gray-400"><IndianRupee size={16} /></span>
            <input
              type="number"
              required
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="e.g. 50000"
              value={formData.monthly_income}
              onChange={(e) => setFormData({ ...formData, monthly_income: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Target Loan Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-gray-400"><IndianRupee size={16} /></span>
            <input
              type="number"
              required
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="e.g. 1000000"
              value={formData.loan_amount_needed}
              onChange={(e) => setFormData({ ...formData, loan_amount_needed: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Preferred Tenure (Months)</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-gray-400"><Clock size={16} /></span>
            <input
              type="number"
              required
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="e.g. 60"
              value={formData.preferred_tenure_months}
              onChange={(e) => setFormData({ ...formData, preferred_tenure_months: e.target.value })}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors shadow-md hover:shadow-lg disabled:opacity-50"
        >
          {loading ? 'Saving format...' : 'Continue to Dashboard'}
        </button>
      </form>
    </div>
  );
}
