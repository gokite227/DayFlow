package com.dayflow.api.user;

import com.dayflow.api.event.EventCategoryService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** AUTH-002: resolves a provider sign-in to a DayFlow user, creating the user on the first sign-in. */
@Service
public class UserAccountService {

    private final UserRepository users;
    private final UserIdentityRepository identities;
    private final EventCategoryService eventCategories;

    public UserAccountService(UserRepository users, UserIdentityRepository identities,
            EventCategoryService eventCategories) {
        this.users = users;
        this.identities = identities;
        this.eventCategories = eventCategories;
    }

    /**
     * The user of this (provider, subject). An existing user keeps its id even when the provider now reports
     * another email or name; only the profile fields are refreshed. A new subject is always a new user, even
     * with an email another user already has: accounts are never merged by email.
     */
    @Transactional
    public User signIn(ExternalIdentity identity) {
        return identities.findByProviderAndProviderSubject(identity.provider(), identity.subject())
                .map(link -> {
                    User user = users.findById(link.getUserId()).orElseThrow();
                    user.updateProfile(identity.email(), identity.displayName(), identity.avatarUrl());
                    return users.saveAndFlush(user);
                })
                .orElseGet(() -> createUser(identity));
    }

    /**
     * The user, the identity and the default Event Categories are written in this one transaction: if any
     * of them fails, nothing of the new user is left behind.
     */
    private User createUser(ExternalIdentity identity) {
        User user = users.saveAndFlush(new User(identity.email(), identity.displayName(), identity.avatarUrl()));
        identities.saveAndFlush(new UserIdentity(user.getId(), identity.provider(), identity.subject(),
                identity.email()));
        eventCategories.createDefaults(user.getId());
        return user;
    }
}
