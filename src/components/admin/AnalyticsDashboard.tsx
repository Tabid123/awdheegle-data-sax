import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Package, Smartphone, CheckCircle, Clock, XCircle } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { Skeleton } from '@/components/ui/skeleton';

interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  completedOrders: number;
  processingOrders: number;
  failedOrders: number;
  activeDevices: number;
}

interface ProviderStat {
  id: string;
  name: string;
  orders: number;
  revenue: number;
}

export const AnalyticsDashboard = ({ refreshTrigger }: { refreshTrigger?: number }) => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalRevenue: 0,
    totalOrders: 0,
    completedOrders: 0,
    processingOrders: 0,
    failedOrders: 0,
    activeDevices: 0,
  });
  const [providerStats, setProviderStats] = useState<ProviderStat[]>([]);

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      try {
        const [ordersRes, providersRes, devicesRes] = await Promise.all([
          supabase.from('orders').select('id, amount, status, provider_id'),
          supabase.from('providers_config').select('id, display_name, provider_name').eq('is_active', true).order('sort_order'),
          supabase.from('android_devices').select('id', { count: 'exact', head: true }).eq('is_active', true),
        ]);

        const orders = ordersRes.data || [];
        const providers = providersRes.data || [];

        const totalRevenue = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
        const completedOrders = orders.filter((order) => order.status === 'completed').length;
        const processingOrders = orders.filter((order) => order.status === 'processing' || order.status === 'pending').length;
        const failedOrders = orders.filter((order) => order.status === 'failed' || order.status === 'cancelled').length;

        setAnalytics({
          totalRevenue,
          totalOrders: orders.length,
          completedOrders,
          processingOrders,
          failedOrders,
          activeDevices: devicesRes.count || 0,
        });

        const groupedProviders = providers.map((provider) => {
          const providerOrders = orders.filter((order) => order.provider_id === provider.id);
          return {
            id: provider.id,
            name: provider.display_name || provider.provider_name,
            orders: providerOrders.length,
            revenue: providerOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
          };
        });

        setProviderStats(groupedProviders);
      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, [refreshTrigger]);

  const topProviders = useMemo(
    () => [...providerStats].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    [providerStats]
  );

  const StatCard = ({ title, value, icon: Icon }: { title: string; value: string | number; icon: any }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-20" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={language === 'so' ? 'Dakhliga Guud' : 'Total Revenue'}
          value={`$${formatPrice(analytics.totalRevenue)}`}
          icon={DollarSign}
        />
        <StatCard
          title={language === 'so' ? 'Dalabaadka Guud' : 'Total Orders'}
          value={analytics.totalOrders}
          icon={Package}
        />
        <StatCard
          title={language === 'so' ? 'La Dhameeyay' : 'Completed'}
          value={analytics.completedOrders}
          icon={CheckCircle}
        />
        <StatCard
          title={language === 'so' ? 'Devices Firfircoon' : 'Active Devices'}
          value={analytics.activeDevices}
          icon={Smartphone}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={language === 'so' ? 'Socda' : 'Processing'}
          value={analytics.processingOrders}
          icon={Clock}
        />
        <StatCard
          title={language === 'so' ? 'Fashilmay' : 'Failed'}
          value={analytics.failedOrders}
          icon={XCircle}
        />
        <StatCard
          title={language === 'so' ? 'Celceliska Qiimaha' : 'Average Order Value'}
          value={`$${formatPrice(analytics.totalOrders ? analytics.totalRevenue / analytics.totalOrders : 0)}`}
          icon={DollarSign}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{language === 'so' ? 'Provider-yada Ugu Sareeya' : 'Top Providers'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{language === 'so' ? 'Xog lama helin' : 'No data yet'}</p>
          ) : (
            topProviders.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-foreground">{provider.name}</p>
                  <p className="text-sm text-muted-foreground">{provider.orders} {language === 'so' ? 'dalab' : 'orders'}</p>
                </div>
                <p className="font-semibold text-primary">${formatPrice(provider.revenue)}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
