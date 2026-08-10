import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import DataRetentionSettings from './DataRetentionSettings';

interface AppSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  description: string | null;
}

const AppSettings = () => {
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .order('setting_key');
      if (error) throw error;
      return (data || []) as unknown as AppSetting[];
    },
  });

  const updateSetting = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: any }) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ setting_value: value })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Settings updated');
    },
    onError: () => toast.error('Failed to update settings'),
  });

  if (isLoading) return <div className="p-4">Loading settings...</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">App Settings</h2>
        <p className="text-muted-foreground">Maaree sida app-ka u muuqdo</p>
      </div>

      <div className="space-y-4">
        <DataRetentionSettings />

        {settings.filter((s) => s.setting_key !== 'data_retention_days').map((setting) => {
          const isBool = typeof setting.setting_value === 'boolean';
          return (
            <Card key={setting.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <Label htmlFor={setting.setting_key} className="text-base font-medium">
                    {setting.setting_key}
                  </Label>
                  {setting.description && (
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                  )}
                </div>
                {isBool ? (
                  <Switch
                    id={setting.setting_key}
                    checked={!!setting.setting_value}
                    onCheckedChange={(checked) =>
                      updateSetting.mutate({ id: setting.id, value: checked })
                    }
                  />
                ) : (
                  <code className="text-xs text-muted-foreground">
                    {JSON.stringify(setting.setting_value)}
                  </code>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AppSettings;
