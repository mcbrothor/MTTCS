-- The baseline scheduler exposed a one-argument invoker. All registered jobs now
-- use the slot-claiming three-argument function, so remove the obsolete overload.

drop function if exists mtn_internal.invoke_cron(text);
