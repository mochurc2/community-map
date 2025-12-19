drop policy "Turnstile clients add bubble options" on "public"."bubble_options";

drop policy "Turnstile clients edit their pending bubbles" on "public"."bubble_options";

drop policy "Turnstile clients read bubble options" on "public"."bubble_options";

drop policy "Turnstile clients can submit messages" on "public"."messages";


  create policy "Turnstile clients add bubble options"
  on "public"."bubble_options"
  as permissive
  for insert
  to public
with check ((public.turnstile_verified() AND (status = 'pending'::text)));



  create policy "Turnstile clients edit their pending bubbles"
  on "public"."bubble_options"
  as permissive
  for update
  to public
using ((public.turnstile_verified() AND (status = 'pending'::text) AND public.is_request_owner(created_by)))
with check ((public.turnstile_verified() AND (status = 'pending'::text) AND public.is_request_owner(created_by)));



  create policy "Turnstile clients read bubble options"
  on "public"."bubble_options"
  as permissive
  for select
  to public
using ((public.turnstile_verified() AND ((status = 'approved'::text) OR public.is_request_owner(created_by))));



  create policy "Turnstile clients can submit messages"
  on "public"."messages"
  as permissive
  for insert
  to public
with check ((public.turnstile_verified() AND (status = 'open'::text) AND (kind = ANY (ARRAY['site_feedback'::text, 'pin_report'::text]))));



