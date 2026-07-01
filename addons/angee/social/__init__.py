"""Social addon: public feeds, engagement, following, and the public-thread surface.

Built on ``messaging`` — it *extends* the messaging Thread/Message rows through the
Angee ``extends`` seams (never by forking messaging) and reuses the one idempotent
``Message.objects.ingest`` write path. A ``Feed`` is an ``integrate.Integration``
child (a ``Bridge``) that polls an external platform for public posts; the social
overlay (engagement ``PostMetrics``, per-actor reactions on the reused
``messaging.Reaction`` table, following via
``FeedFollow``, and per-account API ``Quota``) rides on top. The dependency points
one way (social → messaging → parties/integrate/storage).
"""
