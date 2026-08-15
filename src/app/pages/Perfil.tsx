import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../AuthContext';
import { updateOwnProfileOnServer } from '../modules/usuario/usersServerApi';
import { fetchEmpresas } from '../modules/empresa';
import { fileToAvatarDataUrl } from '../lib/avatarImage';
import {
  normalizeTemperaturaUnidad,
  type TemperaturaUnidad,
} from '../lib/temperatureUnit';
import type { Empresa, UserSexo } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import {
  UserCircle,
  KeyRound,
  Globe,
  Building2,
  Upload,
  Trash2,
  Sun,
  Moon,
  Thermometer,
} from 'lucide-react';
import { useAppTheme } from '../ThemeContext';
import { useLocale } from '../i18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { resolveUserCategory } from '../modules/usuario';

function initialsOf(user: {
  displayName?: string;
  nombres?: string;
  apellidos?: string;
  username: string;
}): string {
  const base = (
    user.displayName ||
    [user.nombres, user.apellidos].filter(Boolean).join(' ') ||
    user.username ||
    '?'
  ).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

export default function Perfil() {
  const { user, applyUser } = useAuth();
  const { theme, setTheme, ready: themeReady } = useAppTheme();
  const { t } = useLocale();
  const roleLabel = (u: { superUser?: boolean; category?: string; role?: string }) => {
    const c = resolveUserCategory(u as import('../types').User);
    if (c === 'superadmin') return t('roles.superadmin');
    if (c === 'admin') return t('roles.admin');
    return u.role ?? '—';
  };
  const [nombres, setNombres] = useState(user?.nombres ?? '');
  const [apellidos, setApellidos] = useState(user?.apellidos ?? '');
  const [cargo, setCargo] = useState(user?.cargo ?? '');
  const [dni, setDni] = useState(user?.dni ?? '');
  const [correo, setCorreo] = useState(user?.correo ?? '');
  const [telefono, setTelefono] = useState(user?.telefono ?? '');
  const [sexo, setSexo] = useState<'' | UserSexo>(user?.sexo ?? '');
  const [zonaHoraria, setZonaHoraria] = useState(user?.zonaHoraria ?? 'GMT-5');
  const [temperaturaUnidad, setTemperaturaUnidad] = useState(
    normalizeTemperaturaUnidad(user?.temperaturaUnidad)
  );
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNombres(user?.nombres ?? '');
    setApellidos(user?.apellidos ?? '');
    setCargo(user?.cargo ?? '');
    setDni(user?.dni ?? '');
    setCorreo(user?.correo ?? '');
    setTelefono(user?.telefono ?? '');
    setSexo(user?.sexo ?? '');
    setZonaHoraria(user?.zonaHoraria ?? 'GMT-5');
    setTemperaturaUnidad(normalizeTemperaturaUnidad(user?.temperaturaUnidad));
    if (!avatarDirty) setAvatarUrl(user?.avatarUrl ?? '');
  }, [user, avatarDirty]);

  useEffect(() => {
    if (!user?.empresaId) {
      setEmpresa(null);
      return;
    }
    void fetchEmpresas()
      .then((list) => setEmpresa(list.find((e) => e.id === user.empresaId) ?? null))
      .catch(() => setEmpresa(null));
  }, [user?.empresaId]);

  const accessSummary = useMemo(() => {
    if (!user) return '—';
    if (user.superUser || user.deviceAccess?.includes('all')) return t('perfil.allDevices');
    return t('perfil.devicesCount', { count: user.deviceAccess?.length ?? 0 });
  }, [user, t]);

  if (user == null) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setUploadingAvatar(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setAvatarUrl(dataUrl);
      setAvatarDirty(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('perfil.imageError'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const clearAvatar = () => {
    setAvatarUrl('');
    setAvatarDirty(true);
  };

  const saveProfile = async () => {
    setError(null);
    setMessage(null);
    if (newPassword && newPassword !== confirmPassword) {
      setError(t('perfil.passwordMismatch'));
      return;
    }
    if (newPassword && !currentPassword) {
      setError(t('perfil.needCurrentPassword'));
      return;
    }
    setSaving(true);
    try {
      const updated = await updateOwnProfileOnServer(
        user.id,
        {
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          cargo: cargo.trim(),
          dni: dni.trim(),
          correo: correo.trim(),
          telefono: telefono.trim(),
          sexo: sexo || '',
          displayName: [nombres.trim(), apellidos.trim()].filter(Boolean).join(' '),
          zonaHoraria,
          temperaturaUnidad,
          ...(avatarDirty ? { avatarUrl: avatarUrl || '' } : {}),
          ...(newPassword ? { currentPassword, newPassword } : {}),
        },
        user.username
      );
      applyUser({ ...updated, password: '' });
      setAvatarDirty(false);
      setAvatarUrl(updated.avatarUrl ?? '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(t('perfil.updated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('perfil.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('perfil.title')}</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCircle className="h-4 w-4" />
            {t('perfil.account')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <Avatar className="size-20">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
              <AvatarFallback className="bg-blue-600 text-white text-lg">
                {initialsOf({ ...user, nombres, apellidos })}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <div>
                <div className="font-medium text-lg">
                  {[nombres, apellidos].filter(Boolean).join(' ') || user.username}
                </div>
                <div className="text-sm text-muted-foreground">@{user.username}</div>
                <Badge variant="secondary" className="mt-1">
                  {roleLabel(user)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <Label
                  htmlFor="avatar-file"
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm cursor-pointer hover:bg-muted"
                >
                  <Upload className="h-4 w-4" />
                  {uploadingAvatar ? t('perfil.processing') : t('perfil.uploadImage')}
                </Label>
                <input
                  id="avatar-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  disabled={uploadingAvatar || saving}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    void onPickAvatar(f);
                  }}
                />
                {avatarUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={clearAvatar}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    {t('perfil.removeImage')}
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('perfil.avatarHint')}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('perfil.firstName')}</Label>
              <Input value={nombres} onChange={(e) => setNombres(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('perfil.lastName')}</Label>
              <Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('perfil.position')}</Label>
              <Input value={cargo} onChange={(e) => setCargo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('perfil.dni')}</Label>
              <Input value={dni} onChange={(e) => setDni(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('perfil.email')}</Label>
              <Input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('perfil.phone')}</Label>
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('perfil.gender')}</Label>
              <Select
                value={sexo || '__none__'}
                onValueChange={(v) => setSexo(v === '__none__' ? '' : (v as UserSexo))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('common.optional')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  <SelectItem value="M">{t('perfil.genderMale')}</SelectItem>
                  <SelectItem value="F">{t('perfil.genderFemale')}</SelectItem>
                  <SelectItem value="O">{t('perfil.genderOther')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('perfil.username')}</Label>
              <Input value={user.username} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>{t('perfil.type')}</Label>
              <Input value={roleLabel(user)} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>{t('perfil.deviceAccess')}</Label>
              <Input value={accessSummary} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {t('perfil.company')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {empresa ? (
            <div className="space-y-1 text-sm">
              <div className="font-medium text-base">{empresa.nombre}</div>
              {empresa.ruc && (
                <p className="text-muted-foreground">RUC: {empresa.ruc}</p>
              )}
              {empresa.direccion && (
                <p className="text-muted-foreground">{empresa.direccion}</p>
              )}
              <p className="text-muted-foreground">
                {[empresa.correo, empresa.telefono].filter(Boolean).join(' · ')}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('perfil.noCompany')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {t('perfil.appearance')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>{t('common.language')}</Label>
            <p className="text-sm text-muted-foreground">{t('perfil.languageHint')}</p>
            <LanguageSwitcher />
          </div>
          {themeReady && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('light')}
              >
                <Sun className="h-4 w-4 mr-1.5" />
                {t('layout.lightMode')}
              </Button>
              <Button
                type="button"
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('dark')}
              >
                <Moon className="h-4 w-4 mr-1.5" />
                {t('layout.darkMode')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t('perfil.timezone')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xs space-y-1.5">
            <Label>Zona horaria</Label>
            <Select value={zonaHoraria} onValueChange={setZonaHoraria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GMT-5">GMT-5 (Lima / Bogotá)</SelectItem>
                <SelectItem value="GMT-4">GMT-4 (Caracas / La Paz)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Thermometer className="h-4 w-4" />
            {t('perfil.tempUnit')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xs space-y-1.5">
            <Select
              value={temperaturaUnidad}
              onValueChange={(v) =>
                setTemperaturaUnidad(normalizeTemperaturaUnidad(v) as TemperaturaUnidad)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="C">{t('perfil.celsius')}</SelectItem>
                <SelectItem value="F">{t('perfil.fahrenheit')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {t('perfil.changePassword')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('perfil.passwordHint')}
          </p>
          <div className="grid gap-3 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">{t('perfil.currentPassword')}</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">{t('perfil.newPassword')}</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">{t('perfil.confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <Button onClick={() => void saveProfile()} disabled={saving}>
        {saving ? t('perfil.saving') : t('perfil.saveChanges')}
      </Button>
    </div>
  );
}
