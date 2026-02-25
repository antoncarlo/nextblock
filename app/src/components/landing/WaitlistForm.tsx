"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Send, CheckCircle } from "lucide-react";
import { z } from "zod";
import { useToast } from "@/hooks-landing/use-toast";
import { supabase } from "@/integrations/supabase/client";

const waitlistSchema = z.object({
  fullName: z.string().trim().min(1, { message: "Full name is required" }).max(100),
  email: z.string().trim().email({ message: "Please enter a valid email" }).max(255),
});

const WaitlistForm = () => {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    const result = waitlistSchema.safeParse(formData);
    
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Save to Supabase
      const { error: dbError } = await supabase
        .from('waitlist_submissions')
        .insert({
          full_name: result.data.fullName,
          company: 'N/A',
          email: result.data.email,
          interest: 'investor',
          message: null,
        });

      if (dbError) throw dbError;

      // Send welcome email via Resend
      const resendResponse = await supabase.functions.invoke('send-welcome-email', {
        body: {
          email: result.data.email,
          fullName: result.data.fullName,
        },
      });

      if (resendResponse.error && process.env.NODE_ENV === 'development') {
        console.error('Resend welcome email error:', resendResponse.error);
      }

      setIsSubmitted(true);
      toast({
        title: "Request Submitted!",
        description: "We'll be in touch soon with exclusive updates.",
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error submitting waitlist:', error);
      }
      toast({
        title: "Submission Failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-12"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: 'rgba(27, 58, 107, 0.1)' }}
        >
          <CheckCircle className="w-10 h-10" style={{ color: '#1B3A6B' }} />
        </motion.div>
        <h3 
          className="text-2xl font-bold mb-2"
          style={{ color: '#0F1218' }}
        >
          You're on the list!
        </h3>
        <p style={{ color: '#8A8A8A' }}>
          Thank you for your interest. We'll keep you updated.
        </p>
      </motion.div>
    );
  }

  const inputStyle = {
    backgroundColor: '#FAFAF8',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: '8px',
    color: '#1A1F2E',
  };

  const labelStyle = {
    color: '#4A4A4A',
    fontWeight: 500,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label 
          htmlFor="fullName" 
          className="block text-sm mb-2"
          style={labelStyle}
        >
          Full Name *
        </label>
        <input
          type="text"
          id="fullName"
          value={formData.fullName}
          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
          placeholder="John Doe"
          className="w-full px-4 py-3 transition-colors focus:outline-none"
          style={inputStyle}
        />
        {errors.fullName && (
          <p className="mt-2 text-sm text-red-600">{errors.fullName}</p>
        )}
      </div>

      <div>
        <label 
          htmlFor="email" 
          className="block text-sm mb-2"
          style={labelStyle}
        >
          Email Address *
        </label>
        <input
          type="email"
          id="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="you@company.com"
          className="w-full px-4 py-3 transition-colors focus:outline-none"
          style={inputStyle}
        />
        {errors.email && (
          <p className="mt-2 text-sm text-red-600">{errors.email}</p>
        )}
      </div>

      <motion.button
        type="submit"
        disabled={isLoading}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-md font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: '#1B3A6B',
          color: '#FFFFFF',
        }}
      >
        {isLoading ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
          />
        ) : (
          <>
            <Send className="w-5 h-5" />
            Submit
          </>
        )}
      </motion.button>

      <p 
        className="text-xs text-center"
        style={{ color: '#8A8A8A' }}
      >
        By submitting, you agree to our terms of service and privacy policy.
      </p>
    </form>
  );
};

export default WaitlistForm;
