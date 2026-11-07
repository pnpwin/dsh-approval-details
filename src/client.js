/** Loaded by the installed DSH Client module registry; no shell rebuild is needed. */
window.__ModuleLoader__.load({
  id: '@pnpwin/dsh-approval-details',
  factory(require) {
    const { createElement: h } = require('react');
    const namespace = 'pnpwin-approval-details';
    const dictionaries = {
      en: { confirmTool: 'Confirm tool: {toolName}' },
      ru: { confirmTool: 'Подтвердите инструмент: {toolName}' },
      zh: { confirmTool: '确认工具：{toolName}' },
      ja: { confirmTool: 'ツールを確認：{toolName}' },
      de: { confirmTool: 'Tool bestätigen: {toolName}' },
      es: { confirmTool: 'Confirmar herramienta: {toolName}' },
      fr: { confirmTool: 'Confirmer l’outil : {toolName}' },
      pt: { confirmTool: 'Confirmar ferramenta: {toolName}' },
    };

    /** Resolve the existing localized reason without translating reviewer output. */
    function reasonOf(approval, locale) {
      if (approval.displayReason === undefined) return approval.reason;
      let id = locale.active;
      while (id !== undefined) {
        if (approval.displayReason[id] !== undefined) return approval.displayReason[id];
        id = locale.locales.find(language => language.id === id)?.fallback;
      }
      return approval.displayReason.en;
    }

    /** Select only the awaiting call, never a sibling's command or a settled call. */
    function commandOf(snapshot, callId) {
      // Read the active-call projection, not the complete Chat history or Session log.
      const pending = [...snapshot.legacy.runningCalls];
      while (pending.length > 0) {
        const call = pending.pop();
        if (call.callId === callId) {
          if ('kind' in call || call.phase !== 'start') return undefined;
          let args;
          try {
            args = JSON.parse(call.argsRaw);
          } catch {
            return undefined;
          }
          if (args === null || typeof args !== 'object' || Array.isArray(args)) return undefined;
          if (typeof args.command === 'string') return args.command;
          const name = call.name.split(/[.:/]/).at(-1);
          return name === 'terminal_send' && typeof args.text === 'string' ? args.text : undefined;
        }
        pending.push(...call.subCalls);
      }
      return undefined;
    }

    function CommandDetail(props) {
      const command = props.useChat(snapshot => commandOf(snapshot, props.callId));
      if (command === undefined) return null;
      return h('pre', {
        'data-approval-command': '',
        style: {
          margin: 0,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          fontFamily: 'var(--ds-font-family-code)',
          fontSize: 'inherit',
          color: 'var(--dsw-alias-label-primary)',
          textAlign: 'left',
          userSelect: 'text',
        },
      }, command);
    }

    function ApprovalPanel(props) {
      const approval = props.matched;
      const reason = props.resolveReason(approval);
      return props.renderFactorySlot('conversation.approval.card', {
        requestKey: approval.key,
        title: props.t('confirmTool', { toolName: approval.toolName }),
        ...(reason === undefined ? {} : { description: reason }),
        ...(approval.callId === undefined ? {} : { callId: approval.callId }),
        canAnswer: () => approval.answerable,
        onAllow: () => approval.answer('allowed-once'),
        onReject: () => approval.answer('rejected'),
      });
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(namespace, dictionaries), 'approval details: copy');
        // Preserve the standard approval lifecycle, actions, keyboard handling and permissions.
        ctx.slots.inject('conversation.composer', () => ctx.slots.register({
          name: 'conversation.composer',
          priority: -1,
          locale: namespace,
          select: ({ pendingInteraction }) => pendingInteraction?.kind === 'approval' ? pendingInteraction : null,
          inject: () => ({ resolveReason: approval => reasonOf(approval, ctx.locale.getLocale()) }),
        }, ApprovalPanel));
        ctx.slots.inject('conversation.approval.detail', () => ctx.slots.register({
          name: 'conversation.approval.detail',
          priority: -1,
        }, CommandDetail));
      },
    };
  },
});
