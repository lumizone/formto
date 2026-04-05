import { useState, useEffect } from 'react'
import { Mail, Send, Save, Loader2, CheckCircle, FlaskConical, Slack } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'

export default function NotificationsTab() {
  const { user, updateUser } = useAuth()
  const [saving, setSaving]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [f, setF] = useState({
    notify_email:       '',
    smtp_host:          '',
    smtp_port:          '587',
    smtp_secure:        false,
    smtp_user:          '',
    smtp_pass:          '',
    smtp_from:          '',
    telegram_bot_token: '',
    telegram_chat_id:   '',
    slack_webhook_url:  '',
  })

  useEffect(() => {
    if (!user) return
    const s = user.smtp_config || {}
    setF({
      notify_email:       user.notify_email        || '',
      smtp_host:          s.host                   || '',
      smtp_port:          String(s.port || 587),
      smtp_secure:        !!s.secure,
      smtp_user:          s.user                   || '',
      smtp_pass:          s.pass                   || '', // '••••••••' if already set
      smtp_from:          s.from                   || '',
      telegram_bot_token: user.telegram_bot_token  || '',
      telegram_chat_id:   user.telegram_chat_id    || '',
      slack_webhook_url:  user.slack_webhook_url   || '',
    })
  }, [user])

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data } = await api.put('/api/auth/me', {
        notify_email:       f.notify_email.trim()       || null,
        telegram_bot_token: f.telegram_bot_token.trim() || null,
        telegram_chat_id:   f.telegram_chat_id.trim()   || null,
        slack_webhook_url:  f.slack_webhook_url.trim()  || null,
        smtp_config: f.smtp_host.trim() ? {
          host:   f.smtp_host.trim(),
          port:   Number(f.smtp_port) || 587,
          secure: f.smtp_secure,
          user:   f.smtp_user.trim() || null,
          pass:   f.smtp_pass || null,
          from:   f.smtp_from.trim() || null,
        } : null,
      })
      updateUser(data.user)
      toast({ title: 'Saved', description: 'Notification settings updated.' })
    } catch (err) {
      toast({ title: 'Error', description: err.response?.data?.error || 'Failed to save', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    setTesting(true)
    try {
      await api.post('/api/auth/test-email')
      toast({ title: 'Test email sent!', description: `Check inbox at ${f.notify_email}` })
    } catch (err) {
      toast({
        title: 'Failed to send',
        description: err.response?.data?.error || 'Check your SMTP settings',
        variant: 'destructive'
      })
    } finally {
      setTesting(false)
    }
  }

  const smtpOk     = !!user?.smtp_config?.host
  const emailOk    = !!user?.notify_email
  const telegramOk = !!(user?.telegram_bot_token && user?.telegram_chat_id)
  const slackOk    = !!user?.slack_webhook_url

  return (
    <div className="space-y-6">

      {/* ── Email ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Email</CardTitle>
            {emailOk && smtpOk && <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />}
          </div>
          <CardDescription>Receive an email on each new submission</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          <div className="space-y-1.5">
            <Label htmlFor="notify_email">Send notifications to</Label>
            <Input
              id="notify_email"
              type="email"
              placeholder="you@example.com"
              value={f.notify_email}
              onChange={e => set('notify_email', e.target.value)}
              disabled={saving}
            />
          </div>

          <Separator />
          <p className="text-sm font-medium">SMTP server</p>
          <p className="text-xs text-muted-foreground -mt-3">
            Used to send emails. Works with Gmail, Mailgun, Postmark, Brevo, or any SMTP provider.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="smtp_host">Host</Label>
              <Input id="smtp_host" placeholder="smtp.gmail.com"
                value={f.smtp_host} onChange={e => set('smtp_host', e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp_port">Port</Label>
              <Input id="smtp_port" placeholder="587"
                value={f.smtp_port} onChange={e => set('smtp_port', e.target.value)} disabled={saving} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="smtp_secure" checked={f.smtp_secure}
              onCheckedChange={v => set('smtp_secure', v)} disabled={saving} />
            <Label htmlFor="smtp_secure" className="cursor-pointer font-normal">
              SSL/TLS <span className="text-xs text-muted-foreground">(port 465)</span>
            </Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="smtp_user">Username</Label>
              <Input id="smtp_user" placeholder="you@gmail.com"
                value={f.smtp_user} onChange={e => set('smtp_user', e.target.value)}
                disabled={saving} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp_pass">Password / App password</Label>
              <Input id="smtp_pass" type="password"
                placeholder={smtpOk ? '••••••••' : 'App password'}
                value={f.smtp_pass} onChange={e => set('smtp_pass', e.target.value)}
                disabled={saving} autoComplete="new-password" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="smtp_from">From address</Label>
            <Input id="smtp_from" placeholder="FormTo <noreply@example.com>"
              value={f.smtp_from} onChange={e => set('smtp_from', e.target.value)} disabled={saving} />
          </div>

          <div className="bg-muted rounded-lg p-3 text-xs space-y-1">
            <p className="font-medium">Gmail</p>
            <p className="text-muted-foreground">
              Enable 2-step verification → <strong>myaccount.google.com/apppasswords</strong> → create App Password → paste above.
              Use <strong>smtp.gmail.com</strong>, port <strong>587</strong>, SSL off.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="button" variant="outline" size="sm"
              onClick={handleTestEmail}
              disabled={testing || saving || !emailOk || !smtpOk}
            >
              {testing
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sending…</>
                : <><FlaskConical className="h-3.5 w-3.5 mr-1.5" />Send test email</>}
            </Button>
            {(!emailOk || !smtpOk) &&
              <p className="text-xs text-muted-foreground">Save settings first to enable the test</p>}
          </div>

        </CardContent>
      </Card>

      {/* ── Telegram ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Telegram</CardTitle>
            {telegramOk && <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />}
          </div>
          <CardDescription>Receive a Telegram message on each new submission</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="telegram_bot_token">Bot Token</Label>
            <Input id="telegram_bot_token" placeholder="123456789:AAF..."
              value={f.telegram_bot_token} onChange={e => set('telegram_bot_token', e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telegram_chat_id">Chat ID</Label>
            <Input id="telegram_chat_id" placeholder="-1001234567890"
              value={f.telegram_chat_id} onChange={e => set('telegram_chat_id', e.target.value)} disabled={saving} />
          </div>
          <div className="bg-muted rounded-lg p-3 text-xs space-y-1">
            <p className="font-medium">How to set up</p>
            <ol className="text-muted-foreground list-decimal list-inside space-y-0.5">
              <li>Search <strong>@BotFather</strong> on Telegram → <code className="bg-background px-1 rounded">/newbot</code> → copy Bot Token</li>
              <li>Start a chat with your bot or add it to a group</li>
              <li>Get Chat ID: message <strong>@userinfobot</strong> (personal) or <strong>@getidsbot</strong> (group)</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* ── Slack ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Slack className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Slack</CardTitle>
            {slackOk && <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />}
          </div>
          <CardDescription>Receive a Slack message on each new submission</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="slack_webhook_url">Incoming Webhook URL</Label>
            <Input id="slack_webhook_url" placeholder="https://hooks.slack.com/services/..."
              value={f.slack_webhook_url} onChange={e => set('slack_webhook_url', e.target.value)} disabled={saving} />
          </div>
          <div className="bg-muted rounded-lg p-3 text-xs space-y-1">
            <p className="font-medium">How to set up</p>
            <ol className="text-muted-foreground list-decimal list-inside space-y-0.5">
              <li>Go to <strong>api.slack.com/apps</strong> → Create New App → "From scratch"</li>
              <li>In the left menu: <strong>Incoming Webhooks</strong> → toggle On</li>
              <li>Click <strong>Add New Webhook to Workspace</strong> → choose a channel</li>
              <li>Copy the Webhook URL and paste it above</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
          : <><Save className="h-4 w-4 mr-2" />Save settings</>}
      </Button>
    </div>
  )
}
