import { useNavigate, useLocation } from 'react-router-dom';
import { Home, BarChart3, Bell, User } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { useVisualViewport } from '@/hooks/useVisualViewport';

interface BottomNavigationProps {
  onNotificationsClick?: () => void;
}

export function BottomNavigation({ onNotificationsClick }: BottomNavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount, markAsSeen } = useNotifications();
  
  useVisualViewport();

  const isActive = (path: string) => location.pathname === path;

  const handleNotificationsClick = () => {
    markAsSeen();
    if (onNotificationsClick) {
      onNotificationsClick();
    } else {
      navigate('/notifications');
    }
  };

  const navItems = [
    { icon: Home, path: '/providers', onClick: () => navigate('/providers') },
    { icon: BarChart3, path: '/history', onClick: () => navigate('/history') },
    { icon: Bell, path: '/notifications', onClick: handleNotificationsClick, badge: unreadCount },
    { icon: User, path: '/profile', onClick: () => navigate('/profile') },
  ];

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 transform-gpu"
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        contain: 'layout'
      }}
    >
      <div className="mx-3 mb-2 rounded-2xl bg-background/95 backdrop-blur-lg border border-border shadow-[0_-4px_24px_hsl(var(--primary)/0.15)]">
        <div className="flex justify-around items-center py-2 px-2">
          {navItems.map(({ icon: Icon, path, onClick, badge }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={onClick}
                className={`relative flex flex-col items-center justify-center rounded-xl px-5 py-2 transition-all duration-300 ${
                  active
                    ? 'bg-primary shadow-md scale-105'
                    : 'hover:bg-muted'
                }`}
              >
                <Icon className={`w-6 h-6 transition-colors duration-300 ${
                  active ? 'text-primary-foreground' : 'text-muted-foreground'
                }`} />
                {active && (
                  <div className="w-1 h-1 rounded-full bg-primary-foreground mt-1" />
                )}
                {badge != null && badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
