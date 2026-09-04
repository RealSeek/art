<template>
  <h2 id="settings-teams">团队空间</h2><p class="settings-section-intro">创建团队、分配成员角色并管理协作空间。</p>
  <section v-if="pendingTeamInvitations.length" class="settings-team-builder">
    <header><div><strong>待处理邀请</strong><small>只有受邀邮箱对应的账户可以接受邀请。</small></div><Users :size="19" /></header>
    <div class="settings-team-members"><div v-for="invite in pendingTeamInvitations" :key="invite.id"><span>{{ invite.team.name }}<small>{{ invite.team.owner.displayName }} 邀请你成为{{ teamRoleText[invite.role] || invite.role }} · {{ formatInvitationExpiry(invite.expiresAt) }}</small></span><div><button type="button" :disabled="teamBusy" @click="acceptTeamInvitation(invite.id)">接受</button></div></div></div>
  </section>
  <section class="settings-team-builder"><header><div><strong>创建团队</strong><small>团队创建后，你将成为所有者；默认包含 5 个席位。</small></div><Users :size="19" /></header><form class="settings-team-create" @submit.prevent="createTeam"><label><span>团队名称</span><input v-model.trim="teamDraft.name" required maxlength="100" placeholder="例如：品牌设计团队" /></label><label><span>团队说明</span><input v-model.trim="teamDraft.description" maxlength="2000" placeholder="团队目标或用途（可选）" /></label><button type="submit" :disabled="teamBusy"><LoaderCircle v-if="teamBusy" class="settings-spin" :size="15" />{{ teamBusy ? '创建中' : '创建团队' }}</button></form></section>
  <section v-for="team in teams" :key="team.id" class="settings-team-card">
    <header><div><strong>{{ team.name }}</strong><small>{{ team.description || team.slug }} · {{ team.members.length }}/{{ team.seatLimit }} 席</small></div><div class="settings-team-actions"><button v-if="team.ownerId === auth.session?.id" type="button" @click="editTeam(team)"><Pencil :size="14" />编辑</button><button v-if="team.ownerId === auth.session?.id" type="button" @click="teamInviteId = team.id">邀请成员</button><button v-else type="button" @click="leaveTeam(team)"><LogOut :size="14" />退出</button></div></header>
    <button class="settings-team-resource-summary" type="button" :aria-expanded="expandedTeamId === team.id" @click="toggleTeamResources(team.id)"><span><strong>{{ team._count?.projects || 0 }}</strong><small>项目</small></span><span><strong>{{ team._count?.assets || 0 }}</strong><small>文件</small></span><span><strong>{{ team._count?.knowledgeBases || 0 }}</strong><small>知识库</small></span><em>{{ expandedTeamId === team.id ? '收起' : '查看共享资源' }}</em></button>
    <div v-if="expandedTeamId === team.id" class="settings-team-resources"><template v-if="teamResources[team.id]"><section><strong>项目</strong><span v-for="item in teamResources[team.id]?.projects" :key="item.id">{{ item.name }}<small>{{ item._count.conversations }} 个对话 · {{ item._count.assets }} 个文件</small></span><p v-if="!teamResources[team.id]?.projects.length">暂无团队项目</p></section><section><strong>文件</strong><span v-for="item in teamResources[team.id]?.assets.slice(0, 8)" :key="item.id">{{ item.name }}<small>{{ item.kind }}</small></span><p v-if="!teamResources[team.id]?.assets.length">暂无团队文件</p></section><section><strong>知识库</strong><span v-for="item in teamResources[team.id]?.knowledgeBases" :key="item.id">{{ item.name }}<small>{{ item.documentCount }} 个文件</small></span><p v-if="!teamResources[team.id]?.knowledgeBases.length">暂无团队知识库</p></section></template><LoaderCircle v-else class="settings-spin" :size="18" /></div>
    <div class="settings-team-members"><div v-for="member in team.members" :key="member.userId"><span>{{ member.user.displayName }}<small>{{ member.user.email || '未绑定邮箱' }} · {{ teamRoleText[member.role] || member.role }}</small></span><div v-if="isTeamManager(team)" class="settings-team-member-controls"><template v-if="member.role !== 'OWNER' && team.ownerId === auth.session?.id"><button type="button" @click="transferTeamOwnership(team, member)">转让</button><select :value="member.role" :aria-label="`设置${member.user.displayName}的角色`" @change="updateTeamMemberRole(team.id, member.userId, ($event.target as HTMLSelectElement).value)"><option value="MEMBER">成员</option><option value="ADMIN">管理员</option></select><button type="button" aria-label="移除成员" @click="removeTeamMember(team.id, member.userId)"><Trash2 :size="14" /></button></template></div></div></div>
    <div v-if="team.invitations.length" class="settings-team-members"><div v-for="invite in team.invitations" :key="invite.id"><span>{{ invite.email }}<small>等待接受 · {{ teamRoleText[invite.role] || invite.role }} · {{ formatInvitationExpiry(invite.expiresAt) }}</small></span><div v-if="team.ownerId === auth.session?.id"><button type="button" @click="cancelTeamInvitation(team.id, invite.id)">取消邀请</button></div></div></div>
    <form v-if="teamInviteId === team.id" class="settings-team-invite" @submit.prevent="inviteToTeam(team.id)"><input v-model.trim="teamInviteEmail" required type="email" placeholder="成员邮箱，可邀请尚未注册的用户" /><select v-model="teamInviteRole" aria-label="成员角色"><option value="MEMBER">成员</option><option value="ADMIN">管理员</option></select><button type="submit" :disabled="teamBusy">发送邀请</button><button type="button" @click="teamInviteId = ''">取消</button></form>
    <footer v-if="team.ownerId === auth.session?.id"><button class="danger-button" type="button" @click="deleteTeam(team)"><Trash2 :size="14" />删除团队</button></footer>
  </section><p v-if="!teams.length" class="settings-empty-copy">你还没有加入团队空间。</p><small v-if="teamMessage" class="settings-feedback" :class="{ 'is-error': teamError }">{{ teamMessage }}</small>
</template>

<script setup lang="ts">
import { LoaderCircle, LogOut, Pencil, Trash2, Users } from 'lucide-vue-next'
import { useAuthStore } from '../../../../stores/auth'
import { formatInvitationExpiry } from '../../format'
import { teamRoleText } from '../../labels'
import type {
  PendingTeamInvitation,
  Team,
  TeamDraft,
  TeamMember,
  TeamResources,
} from '../../types'

const props = defineProps<{
  pendingTeamInvitations: PendingTeamInvitation[]
  teams: Team[]
  teamBusy: boolean
  teamMessage: string
  teamError: boolean
  teamDraft: TeamDraft
  expandedTeamId: string
  teamResources: Record<string, TeamResources | undefined>
  acceptTeamInvitation: (invitationId: string) => Promise<unknown>
  createTeam: () => Promise<unknown>
  editTeam: (team: Team) => Promise<unknown>
  leaveTeam: (team: Team) => Promise<unknown>
  deleteTeam: (team: Team) => Promise<unknown>
  toggleTeamResources: (teamId: string) => Promise<unknown>
  transferTeamOwnership: (team: Team, member: TeamMember) => Promise<unknown>
  updateTeamMemberRole: (teamId: string, userId: string, role: string) => Promise<unknown>
  removeTeamMember: (teamId: string, userId: string) => Promise<unknown>
  cancelTeamInvitation: (teamId: string, invitationId: string) => Promise<unknown>
  inviteToTeam: (teamId: string) => Promise<unknown>
}>()

const teamInviteId = defineModel<string>('teamInviteId', { required: true })
const teamInviteEmail = defineModel<string>('teamInviteEmail', { required: true })
const teamInviteRole = defineModel<'MEMBER' | 'ADMIN'>('teamInviteRole', { required: true })

const auth = useAuthStore()

const currentTeamMember = (team: Team) => team.members.find((member) => member.userId === auth.session?.id)
const isTeamManager = (team: Team) => team.ownerId === auth.session?.id || currentTeamMember(team)?.role === 'ADMIN'

void props
</script>
